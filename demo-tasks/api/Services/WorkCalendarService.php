<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\WorkCalendar;
use Trx\Security\Policy;

/**
 * Holidays and vacations for regular tasks and KPI. Everyone with tasks access reads; the owner edits.
 */
final class WorkCalendarService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    public function calendar(string $from, string $to): WorkCalendar
    {
        $pdo = Database::pdo();
        $h = $pdo->prepare('SELECT day FROM holidays WHERE day BETWEEN ? AND ?');
        $h->execute([$from, $to]);
        $v = $pdo->prepare('SELECT user_id, starts_on, ends_on FROM user_vacations WHERE ends_on >= ? AND starts_on <= ?');
        $v->execute([$from, $to]);
        $vacations = [];
        foreach ($v->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $vacations[(int) $row['user_id']][] = [(string) $row['starts_on'], (string) $row['ends_on']];
        }

        return new WorkCalendar(array_map('strval', $h->fetchAll(PDO::FETCH_COLUMN) ?: []), $vacations);
    }

    /** @param array<string, mixed> $user */
    public function overview(array $user): array
    {
        $this->needView($user);
        $pdo = Database::pdo();

        return [
            'holidays' => $pdo->query('SELECT day, title FROM holidays WHERE day >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) ORDER BY day')->fetchAll(PDO::FETCH_ASSOC) ?: [],
            'vacations' => array_map(static fn (array $r): array => [
                'id' => (int) $r['id'], 'user_id' => (int) $r['user_id'], 'user_name' => $r['user_name'],
                'starts_on' => $r['starts_on'], 'ends_on' => $r['ends_on'], 'note' => $r['note'],
            ], $pdo->query(
                'SELECT v.*, u.name AS user_name FROM user_vacations v JOIN users u ON u.id = v.user_id
                 WHERE v.ends_on >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) ORDER BY v.starts_on'
            )->fetchAll(PDO::FETCH_ASSOC) ?: []),
            'kpi_indicators' => $this->indicators(),
        ];
    }

    /** @return list<array{key:string,title:string,max_amount:int}> */
    public function indicators(): array
    {
        return array_map(static fn (array $r): array => ['key' => $r['kpi_key'], 'title' => $r['title'], 'max_amount' => (int) $r['max_amount']],
            Database::pdo()->query('SELECT kpi_key, title, max_amount FROM kpi_indicators WHERE is_active = 1 ORDER BY sort_order, title')->fetchAll(PDO::FETCH_ASSOC) ?: []);
    }

    public function indicatorExists(string $key): bool
    {
        $stmt = Database::pdo()->prepare('SELECT 1 FROM kpi_indicators WHERE kpi_key = ? AND is_active = 1');
        $stmt->execute([$key]);

        return (bool) $stmt->fetchColumn();
    }

    /** @param array<string, mixed> $user */
    public function addHoliday(array $user, array $input): array
    {
        $this->needOwner($user);
        $day = $this->date($input['day'] ?? null, 'Укажите дату праздника');
        $title = mb_substr(trim((string) ($input['title'] ?? '')), 0, 255);
        Database::pdo()->prepare('INSERT INTO holidays (day, title, created_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE title = VALUES(title)')
            ->execute([$day, $title, (int) $user['user_id']]);
        $this->audit->log((int) $user['user_id'], 'holiday', $day, 'save', null, ['title' => $title]);

        return $this->overview($user);
    }

    /** @param array<string, mixed> $user */
    public function deleteHoliday(array $user, string $day): array
    {
        $this->needOwner($user);
        $day = $this->date($day, 'Неверная дата');
        Database::pdo()->prepare('DELETE FROM holidays WHERE day = ?')->execute([$day]);
        $this->audit->log((int) $user['user_id'], 'holiday', $day, 'delete', null, null);

        return $this->overview($user);
    }

    /** @param array<string, mixed> $user */
    public function addVacation(array $user, array $input): array
    {
        $this->needOwner($user);
        $userId = (int) ($input['user_id'] ?? 0);
        $known = Database::pdo()->prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1');
        $known->execute([$userId]);
        if (!$known->fetchColumn()) {
            throw new AppException('Выберите сотрудника');
        }
        $from = $this->date($input['starts_on'] ?? null, 'Укажите начало отпуска');
        $to = $this->date($input['ends_on'] ?? null, 'Укажите конец отпуска');
        if ($to < $from) {
            throw new AppException('Конец отпуска раньше начала');
        }
        $note = mb_substr(trim((string) ($input['note'] ?? '')), 0, 255);
        $pdo = Database::pdo();
        $pdo->prepare('INSERT INTO user_vacations (user_id, starts_on, ends_on, note, created_by) VALUES (?,?,?,?,?)')
            ->execute([$userId, $from, $to, $note, (int) $user['user_id']]);
        $this->audit->log((int) $user['user_id'], 'vacation', (string) $pdo->lastInsertId(), 'save', null, ['user_id' => $userId, 'starts_on' => $from, 'ends_on' => $to]);

        return $this->overview($user);
    }

    /** @param array<string, mixed> $user */
    public function deleteVacation(array $user, int $id): array
    {
        $this->needOwner($user);
        Database::pdo()->prepare('DELETE FROM user_vacations WHERE id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'vacation', (string) $id, 'delete', null, null);

        return $this->overview($user);
    }

    private function date(mixed $value, string $error): string
    {
        $value = (string) $value;
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$d || $d->format('Y-m-d') !== $value) {
            throw new AppException($error);
        }

        return $value;
    }

    /** @param array<string, mixed> $user */
    private function needView(array $user): void
    {
        if (!$this->policy->can($user, 'tasks', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** @param array<string, mixed> $user */
    private function needOwner(array $user): void
    {
        if (($user['role_slug'] ?? '') !== 'owner') {
            throw new AppException('Праздники и отпуска меняет владелец', 403);
        }
    }
}
