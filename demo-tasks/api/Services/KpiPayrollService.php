<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\KpiCalc;
use Trx\Domain\XlsxWriter;
use Trx\Security\Policy;

/**
 * KPI stage 2: monthly payroll = salary (оклад, never reduced) + KPI bonus.
 * Bonus per indicator = max × tasks done on time with proof / planned tasks of the month.
 * The owner reviews, adds a manual adjustment (comment required) and approves — the month is then frozen as a snapshot.
 */
final class KpiPayrollService
{
    public function __construct(
        private readonly AuditService $audit = new AuditService(),
        private readonly TaskService $tasks = new TaskService(),
    ) {
    }

    private static function period(mixed $value): string
    {
        $p = KpiCalc::period($value === null || $value === '' ? date('Y-m') : $value);
        if ($p === null) {
            throw new AppException('Период должен быть в формате ГГГГ-ММ', 422);
        }

        return $p;
    }

    private static function requireOwner(array $actor): void
    {
        if (!Policy::isOwner($actor)) {
            throw new AppException('Только владелец', 403);
        }
    }

    /** @return array<string, mixed>|null */
    private function periodRow(string $period): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM kpi_periods WHERE period = ?');
        $stmt->execute([$period]);

        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /** @return array<string, mixed> */
    public function report(array $actor, mixed $period): array
    {
        $period = self::period($period);
        $owner = Policy::isOwner($actor);
        $row = $this->periodRow($period);
        $approved = $row && $row['status'] === 'approved' && $row['snapshot'];
        $data = $approved ? json_decode((string) $row['snapshot'], true) : $this->calculate($period);
        $employees = $data['employees'] ?? [];
        if (!$owner) {
            $me = (int) ($actor['user_id'] ?? 0);
            $employees = array_values(array_filter($employees, static fn (array $e) => (int) $e['user_id'] === $me));
            if (!$approved) {
                // Own progress only; the owner's adjustment note stays private until the month is approved.
                $employees = array_map(static function (array $e): array {
                    unset($e['adjustment_comment']);
                    return $e;
                }, $employees);
            }
        }

        return [
            'period' => $period,
            'status' => $approved ? 'approved' : 'open',
            'approved_at' => $approved ? $row['approved_at'] : null,
            'approved_by_name' => $approved ? $this->userName((int) $row['approved_by']) : null,
            'reopened_at' => $row['reopened_at'] ?? null,
            'indicators' => $data['indicators'] ?? [],
            'cap' => (int) ($data['cap'] ?? 0),
            'employees' => $employees,
            'totals' => $owner ? ($data['totals'] ?? null) : null,
            'can_manage' => $owner,
        ];
    }

    private function userName(int $id): ?string
    {
        $stmt = Database::pdo()->prepare('SELECT name FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $v = $stmt->fetchColumn();

        return $v === false ? null : (string) $v;
    }

    /** Live calculation from tasks, salaries and adjustments. @return array<string, mixed> */
    public function calculate(string $period): array
    {
        $pdo = Database::pdo();
        $indicators = (new WorkCalendarService())->indicators();
        $cap = array_sum(array_map(static fn (array $i) => (int) $i['max_amount'], $indicators));
        $from = $period . '-01';
        $to = date('Y-m-t', (int) strtotime($from));

        $users = $pdo->query(
            'SELECT u.id, u.name, d.name AS dept_name, s.salary FROM users u
             LEFT JOIN departments d ON d.id = u.department_id
             LEFT JOIN employee_salaries s ON s.user_id = u.id
             WHERE u.is_active = 1 AND u.deleted_at IS NULL AND ' . Policy::hideSuperadminSql('u') . ' ORDER BY u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $adj = $pdo->prepare('SELECT user_id, amount, comment FROM kpi_adjustments WHERE period = ?');
        $adj->execute([$period]);
        $adjustments = [];
        foreach ($adj->fetchAll(PDO::FETCH_ASSOC) ?: [] as $a) {
            $adjustments[(int) $a['user_id']] = $a;
        }

        $stmt = $pdo->prepare(
            "SELECT a.user_id, t.id, t.title, t.kpi_key, t.recur_on, t.due_at, t.status, t.submitted_at, t.completed_at,
                    t.requires_file, t.requires_photo, t.requires_checklist
             FROM tasks t
             JOIN (SELECT task_id, user_id FROM task_assignees
                   UNION SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL) a ON a.task_id = t.id
             WHERE t.kpi_key IS NOT NULL AND t.status <> 'cancelled'
               AND COALESCE(t.recur_on, DATE(t.due_at)) BETWEEN ? AND ?
             ORDER BY COALESCE(t.recur_on, DATE(t.due_at)), t.id"
        );
        $stmt->execute([$from, $to]);
        $byUser = [];
        $proofCache = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $t) {
            $id = (int) $t['id'];
            $ontime = $t['status'] === 'done' && KpiCalc::onTime($t['due_at'], $t['submitted_at'], $t['completed_at']);
            $missing = [];
            if ($t['status'] === 'done') {
                $missing = $proofCache[$id] ??= $this->tasks->missingProof($id, $t);
            }
            $reason = match (true) {
                $t['status'] !== 'done' => 'не выполнена',
                !$ontime => 'сдана с опозданием',
                $missing !== [] => 'нет подтверждения',
                default => null,
            };
            $byUser[(int) $t['user_id']][(string) $t['kpi_key']][] = [
                'id' => $id,
                'title' => $t['title'],
                'day' => $t['recur_on'] ?: substr((string) $t['due_at'], 0, 10),
                'due_at' => $t['due_at'],
                'handed_at' => $t['submitted_at'] ?: $t['completed_at'],
                'status' => $t['status'],
                'counted' => $reason === null,
                'reason' => $reason,
            ];
        }

        $employees = [];
        $totals = ['salary' => 0, 'bonus' => 0, 'pay' => 0];
        foreach ($users as $u) {
            $uid = (int) $u['id'];
            $rows = [];
            $calculated = 0;
            foreach ($indicators as $ind) {
                $list = $byUser[$uid][$ind['key']] ?? [];
                $planned = count($list);
                $done = count(array_filter($list, static fn (array $t) => $t['counted']));
                $bonus = KpiCalc::bonus((int) $ind['max_amount'], $planned, $done);
                $calculated += $bonus;
                $rows[] = [
                    'key' => $ind['key'], 'title' => $ind['title'], 'max_amount' => (int) $ind['max_amount'],
                    'planned' => $planned, 'done' => $done, 'percent' => KpiCalc::percent($planned, $done),
                    'bonus' => $bonus, 'tasks' => $list,
                ];
            }
            $salary = (int) round((float) ($u['salary'] ?? 0));
            $adjAmount = (int) ($adjustments[$uid]['amount'] ?? 0);
            $bonusTotal = KpiCalc::total($calculated, $adjAmount, $cap);
            $hasPlan = array_sum(array_column($rows, 'planned')) > 0;
            if (!$hasPlan && $salary === 0 && !isset($adjustments[$uid])) {
                continue;
            }
            $employees[] = [
                'user_id' => $uid, 'name' => $u['name'], 'dept_name' => $u['dept_name'],
                'salary' => $salary, 'indicators' => $rows, 'bonus_calculated' => $calculated,
                'adjustment' => $adjAmount, 'adjustment_comment' => $adjustments[$uid]['comment'] ?? null,
                'bonus_total' => $bonusTotal, 'total_pay' => $salary + $bonusTotal,
            ];
            $totals['salary'] += $salary;
            $totals['bonus'] += $bonusTotal;
            $totals['pay'] += $salary + $bonusTotal;
        }

        return ['indicators' => $indicators, 'cap' => $cap, 'employees' => $employees, 'totals' => $totals];
    }

    private function requireOpen(string $period): void
    {
        $row = $this->periodRow($period);
        if ($row && $row['status'] === 'approved') {
            throw new AppException('Месяц утверждён. Чтобы изменить, сначала откройте его заново', 409);
        }
    }

    /** @return array<string, mixed> list of employees with salaries (owner) */
    public function salaries(array $actor): array
    {
        self::requireOwner($actor);
        $rows = Database::pdo()->query(
            'SELECT u.id AS user_id, u.name, COALESCE(s.salary, 0) AS salary FROM users u
             LEFT JOIN employee_salaries s ON s.user_id = u.id
             WHERE u.is_active = 1 AND u.deleted_at IS NULL AND ' . Policy::hideSuperadminSql('u') . ' ORDER BY u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return ['items' => array_map(static fn (array $r) => ['user_id' => (int) $r['user_id'], 'name' => $r['name'], 'salary' => (int) round((float) $r['salary'])], $rows)];
    }

    /** @param array<string, mixed> $input */
    public function saveSalary(array $actor, array $input): array
    {
        self::requireOwner($actor);
        $userId = (int) ($input['user_id'] ?? 0);
        $salary = $input['salary'] ?? null;
        if ($userId <= 0 || !is_numeric($salary) || (float) $salary < 0 || (float) $salary > 1e9) {
            throw new AppException('Укажите сотрудника и оклад (0 или больше)', 422);
        }
        $pdo = Database::pdo();
        $old = $pdo->prepare('SELECT salary FROM employee_salaries WHERE user_id = ?');
        $old->execute([$userId]);
        $before = $old->fetchColumn();
        $pdo->prepare('INSERT INTO employee_salaries (user_id, salary, updated_by) VALUES (?,?,?)
                       ON DUPLICATE KEY UPDATE salary = VALUES(salary), updated_by = VALUES(updated_by)')
            ->execute([$userId, round((float) $salary), (int) $actor['user_id']]);
        $this->audit->log((int) $actor['user_id'], 'employee_salary', (string) $userId, 'update',
            $before === false ? null : ['salary' => (float) $before], ['salary' => round((float) $salary)]);

        return $this->salaries($actor);
    }

    /** @param array<string, mixed> $input */
    public function adjust(array $actor, mixed $period, array $input): array
    {
        self::requireOwner($actor);
        $period = self::period($period);
        $this->requireOpen($period);
        $userId = (int) ($input['user_id'] ?? 0);
        $amount = $input['amount'] ?? 0;
        $comment = trim((string) ($input['comment'] ?? ''));
        if ($userId <= 0 || !is_numeric($amount) || abs((float) $amount) > 1e8) {
            throw new AppException('Укажите сотрудника и сумму корректировки', 422);
        }
        $amount = (int) round((float) $amount);
        $pdo = Database::pdo();
        if ($amount === 0) {
            $pdo->prepare('DELETE FROM kpi_adjustments WHERE period = ? AND user_id = ?')->execute([$period, $userId]);
        } else {
            if ($comment === '') {
                throw new AppException('Комментарий к корректировке обязателен', 422);
            }
            $pdo->prepare('INSERT INTO kpi_adjustments (period, user_id, amount, comment, created_by) VALUES (?,?,?,?,?)
                           ON DUPLICATE KEY UPDATE amount = VALUES(amount), comment = VALUES(comment), created_by = VALUES(created_by)')
                ->execute([$period, $userId, $amount, mb_substr($comment, 0, 500), (int) $actor['user_id']]);
        }
        $this->audit->log((int) $actor['user_id'], 'kpi_adjustment', $period . ':' . $userId, 'update', null, ['amount' => $amount, 'comment' => $comment]);

        return $this->report($actor, $period);
    }

    public function approve(array $actor, mixed $period): array
    {
        self::requireOwner($actor);
        $period = self::period($period);
        $this->requireOpen($period);
        $snapshot = $this->calculate($period);
        Database::pdo()->prepare(
            "INSERT INTO kpi_periods (period, status, snapshot, approved_by, approved_at) VALUES (?, 'approved', ?, ?, NOW())
             ON DUPLICATE KEY UPDATE status = 'approved', snapshot = VALUES(snapshot), approved_by = VALUES(approved_by), approved_at = NOW()"
        )->execute([$period, json_encode($snapshot, JSON_UNESCAPED_UNICODE), (int) $actor['user_id']]);
        $this->audit->log((int) $actor['user_id'], 'kpi_period', $period, 'approve', null, $snapshot['totals']);

        return $this->report($actor, $period);
    }

    /** @param array<string, mixed> $input */
    public function reopen(array $actor, mixed $period, array $input = []): array
    {
        self::requireOwner($actor);
        $period = self::period($period);
        $row = $this->periodRow($period);
        if (!$row || $row['status'] !== 'approved') {
            throw new AppException('Месяц не утверждён', 409);
        }
        $reason = mb_substr(trim((string) ($input['reason'] ?? '')), 0, 500);
        Database::pdo()->prepare(
            "UPDATE kpi_periods SET status = 'open', reopened_by = ?, reopened_at = NOW(), reopen_reason = ? WHERE period = ?"
        )->execute([(int) $actor['user_id'], $reason !== '' ? $reason : null, $period]);
        $old = json_decode((string) $row['snapshot'], true);
        $this->audit->log((int) $actor['user_id'], 'kpi_period', $period, 'reopen',
            ['status' => 'approved', 'approved_at' => $row['approved_at'], 'totals' => $old['totals'] ?? null], ['status' => 'open', 'reason' => $reason]);

        return $this->report($actor, $period);
    }

    /** @return array{name: string, body: string} */
    public function export(array $actor, mixed $period): array
    {
        self::requireOwner($actor);
        $r = $this->report($actor, $period);
        $head = ['Сотрудник', 'Отдел', 'Оклад'];
        foreach ($r['indicators'] as $i) {
            array_push($head, $i['title'] . ': план', 'факт', '%', 'бонус');
        }
        array_push($head, 'Бонус расчётный', 'Корректировка', 'Комментарий', 'Бонус итого', 'К выплате');
        $summary = [$head];
        $detail = [['Сотрудник', 'Показатель', 'Дата', 'Задача', 'Срок', 'Сдана', 'Статус', 'Засчитана', 'Причина']];
        foreach ($r['employees'] as $e) {
            $line = [$e['name'], $e['dept_name'] ?? '', $e['salary']];
            foreach ($e['indicators'] as $i) {
                array_push($line, $i['planned'], $i['done'], $i['percent'], $i['bonus']);
                foreach ($i['tasks'] as $t) {
                    $detail[] = [$e['name'], $i['title'], $t['day'], $t['title'], $t['due_at'], $t['handed_at'], $t['status'], $t['counted'] ? 'да' : 'нет', $t['reason']];
                }
            }
            array_push($line, $e['bonus_calculated'], $e['adjustment'], $e['adjustment_comment'] ?? '', $e['bonus_total'], $e['total_pay']);
            $summary[] = $line;
        }
        if ($r['totals']) {
            $summary[] = array_merge(['Итого', '', $r['totals']['salary']], array_fill(0, 4 * count($r['indicators']) + 3, null), [$r['totals']['bonus'], $r['totals']['pay']]);
        }
        $summary[] = [];
        $summary[] = ['Статус: ' . ($r['status'] === 'approved' ? 'утверждён ' . $r['approved_at'] : 'черновик (не утверждён)')];

        return ['name' => 'kpi-' . $r['period'] . '.xlsx', 'body' => XlsxWriter::build(['Зарплата ' . $r['period'] => $summary, 'Задачи' => $detail])];
    }
}
