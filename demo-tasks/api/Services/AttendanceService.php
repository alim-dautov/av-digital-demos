<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\AttendanceCalc;
use Trx\Domain\AttendanceClock;
use Trx\Domain\AttendanceToken;
use Trx\Domain\KpiCalc;
use Trx\Domain\XlsxWriter;
use Trx\Security\Policy;

/**
 * Attendance check-in/out by QR, own history, owner timesheet, owner corrections, Excel.
 * No night shifts: a shift belongs to one working date (Asia/Qyzylorda); leave on another date is refused.
 */
final class AttendanceService
{
    private readonly \Closure $now;

    public function __construct(
        ?\Closure $now = null,
        private readonly ?\Closure $afterLock = null,
        private readonly AttendanceDisplayService $displays = new AttendanceDisplayService(),
        private readonly AuditService $audit = new AuditService(),
        /** Seconds to wait for the per-employee lock (tests use 0). */
        private readonly int $lockWait = 5,
    ) {
        $this->now = $now ?? static fn (): float => microtime(true);
    }

    /** @param array<string, mixed> $extra */
    private function err(string $code, string $message, int $status, array $extra = []): AppException
    {
        return new AppException($message, $status, ['code' => $code] + $extra);
    }

    private function requireEmployee(array $user): void
    {
        if (Policy::isDisplay($user) || !(new Policy())->hasModule($user, 'attendance')) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /**
     * @param array<string, mixed> $in token, kind (in|out), optional confirm_new
     * @return array{ok:true,kind:string,at_local:string,work_date:string,duplicate:bool,shift_id:int}
     */
    public function check(array $user, array $in, string $ip, string $ua): array
    {
        $this->requireEmployee($user);
        $kind = (string) ($in['kind'] ?? '');
        if (!in_array($kind, ['in', 'out'], true)) {
            throw $this->err('qr_invalid', 'Выберите «Приход» или «Уход»', 422);
        }
        $p = AttendanceToken::parse((string) ($in['token'] ?? ''));
        $secret = $p ? $this->displays->secretFor($p['display_id']) : null;
        if (!$p || $secret === null || !AttendanceToken::valid($p, $secret)) {
            throw $this->err('qr_invalid', 'QR недействителен', 422);
        }

        $uid = (int) $user['user_id'];
        $pdo = Database::pdo();
        $this->lock($uid);
        try {
            if ($this->afterLock !== null) {
                ($this->afterLock)();
            }
            // Re-check under the lock, right before writing.
            $nowF = ($this->now)();
            $nowEpoch = AttendanceClock::epoch((int) floor($nowF));
            if ($p['epoch'] < $nowEpoch) {
                throw $this->err('qr_expired_retry', 'QR обновился — отсканируйте ещё раз', 409);
            }
            if ($p['epoch'] > $nowEpoch || $this->displays->secretFor($p['display_id']) === null) {
                throw $this->err('qr_invalid', 'QR недействителен', 422);
            }

            $dup = $pdo->prepare('SELECT e.kind, e.occurred_at_utc, s.id AS shift_id FROM attendance_events e
                LEFT JOIN attendance_shifts s ON s.in_event_id = e.id OR s.out_event_id = e.id
                WHERE e.user_id = ? AND e.epoch = ? LIMIT 1');
            $dup->execute([$uid, $p['epoch']]);
            if ($row = $dup->fetch(PDO::FETCH_ASSOC)) {
                if ($row['kind'] !== $kind) {
                    throw $this->err('already_marked_this_qr', 'По этому QR уже есть отметка — дождитесь нового', 409);
                }

                return ['ok' => true, 'kind' => $kind, 'at_local' => AttendanceClock::local($row['occurred_at_utc']),
                    'work_date' => AttendanceClock::workDate($row['occurred_at_utc']), 'duplicate' => true, 'shift_id' => (int) $row['shift_id']];
            }

            $utc = AttendanceClock::utc((int) floor($nowF));
            $today = AttendanceClock::workDate($utc);
            $pdo->beginTransaction();
            $open = $pdo->prepare("SELECT id, in_at_utc FROM attendance_shifts WHERE user_id = ? AND status = 'open' FOR UPDATE");
            $open->execute([$uid]);
            $shift = $open->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($kind === 'in' && $shift && empty($in['confirm_new'])) {
                throw $this->err('open_shift_exists', 'Предыдущая смена не закрыта', 409, ['open_since_local' => AttendanceClock::local($shift['in_at_utc'])]);
            }
            if ($kind === 'out' && !$shift) {
                throw $this->err('no_open_shift', 'Нет открытого прихода', 409);
            }
            if ($kind === 'out' && AttendanceClock::workDate($shift['in_at_utc']) !== $today) {
                throw $this->err('stale_open_shift', 'Прошлая смена не закрыта. Отметьте «Приход» — прошлую смену исправит владелец', 409,
                    ['open_since_local' => AttendanceClock::local($shift['in_at_utc'])]);
            }
            if ($kind === 'in') {
                // A forgotten open shift becomes incomplete (a point) below; the new one reserves until day end.
                if ($shift) {
                    $pdo->prepare("UPDATE attendance_shifts SET status = 'incomplete' WHERE id = ?")->execute([(int) $shift['id']]);
                }
                $this->assertNoOverlap($uid, $today, $utc, null, null, true, 'shift_overlap');
            } else {
                $this->assertNoOverlap($uid, $today, (string) $shift['in_at_utc'], $utc, (int) $shift['id'], false, 'shift_overlap');
            }
            $pdo->prepare('INSERT INTO attendance_events (user_id, kind, epoch, display_id, occurred_at_utc, ip, user_agent) VALUES (?,?,?,?,?,?,?)')
                ->execute([$uid, $kind, $p['epoch'], $p['display_id'], $utc, mb_substr($ip, 0, 45), mb_substr($ua, 0, 255)]);
            $eventId = (int) $pdo->lastInsertId();
            if ($kind === 'in') {
                // Forgotten leave was already marked incomplete above, without an invented leave time.
                $pdo->prepare('INSERT INTO attendance_shifts (user_id, work_date, in_at_utc, in_event_id) VALUES (?,?,?,?)')
                    ->execute([$uid, $today, $utc, $eventId]);
                $shiftId = (int) $pdo->lastInsertId();
            } else {
                $pdo->prepare("UPDATE attendance_shifts SET out_at_utc = ?, out_event_id = ?, status = 'closed' WHERE id = ?")
                    ->execute([$utc, $eventId, (int) $shift['id']]);
                $shiftId = (int) $shift['id'];
            }
            $pdo->commit();

            return ['ok' => true, 'kind' => $kind, 'at_local' => AttendanceClock::local($utc), 'work_date' => $today, 'duplicate' => false, 'shift_id' => $shiftId];
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e->getCode() === '23000') {
                throw $this->err('busy_retry', 'Повторите через секунду', 409);
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('demo_att_u{$uid}')");
        }
    }

    private static function period(mixed $value): string
    {
        $p = KpiCalc::period($value === null || $value === '' ? date('Y-m') : $value);
        if ($p === null) {
            throw new AppException('Период должен быть в формате ГГГГ-ММ', 422);
        }

        return $p;
    }

    /** @return list<array<string, mixed>> */
    private function shiftsFor(string $period, ?int $userId): array
    {
        $from = $period . '-01';
        $to = date('Y-m-t', (int) strtotime($from));
        $sql = 'SELECT id, user_id, work_date, in_at_utc, out_at_utc, status, edit_comment, edited_at FROM attendance_shifts WHERE work_date BETWEEN ? AND ?';
        $params = [$from, $to];
        if ($userId !== null) {
            $sql .= ' AND user_id = ?';
            $params[] = $userId;
        }
        $stmt = Database::pdo()->prepare($sql . ' ORDER BY work_date, in_at_utc');
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * @param list<array<string, mixed>> $shifts
     * @return list<array<string, mixed>>
     */
    private function days(array $shifts): array
    {
        $out = [];
        foreach (AttendanceCalc::groupByDay($shifts) as $date => $list) {
            $calc = AttendanceCalc::day(array_map(static fn (array $s) => ['in_at_utc' => (string) $s['in_at_utc'], 'out_at_utc' => $s['out_at_utc'], 'status' => (string) $s['status']], $list));
            $out[] = ['work_date' => $date] + $calc + ['shifts' => array_map(static fn (array $s): array => [
                'id' => (int) $s['id'],
                'in_local' => AttendanceClock::local((string) $s['in_at_utc']),
                'out_local' => $s['out_at_utc'] ? AttendanceClock::local((string) $s['out_at_utc']) : null,
                'status' => $s['status'],
                'edit_comment' => $s['edit_comment'],
                'rev' => self::rev($s),
            ], $list)];
        }

        return $out;
    }

    /** Employee: only their own shifts. */
    public function mine(array $user, mixed $period): array
    {
        $this->requireEmployee($user);
        $period = self::period($period);

        return ['period' => $period, 'days' => $this->days($this->shiftsFor($period, (int) $user['user_id']))];
    }

    /** Owner timesheet for a month. */
    /**
     * General timesheet: owner, superadmin or delegated timesheet keeper. Adds day codes and code/QR conflicts.
     * Shift editing (editShift/addShift) stays admin-only.
     */
    public function report(array $actor, mixed $period): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $period = self::period($period);
        $model = (new TimesheetDataService($this))->model($period);
        $data = $model['report'];
        $data['codes'] = $model['codes'];
        $data['code_revs'] = $model['code_revs']; // tokens incl. cleared days; see TimesheetDataService::model
        $data['conflicts'] = $model['conflicts'];
        $data['can_edit_shifts'] = Policy::isAdmin($actor);

        return $data;
    }

    /** Same per-employee lock as QR check and shift edits, so a day code and a new mark never interleave. */
    public function withUserLock(int $uid, \Closure $fn): mixed
    {
        $this->lock($uid);
        try {
            return $fn();
        } finally {
            $this->unlock($uid);
        }
    }

    /** Timesheet data for a month without permission checks (callers check). */
    public function reportData(string $period): array
    {
        $byUser = [];
        foreach ($this->shiftsFor($period, null) as $s) {
            $byUser[(int) $s['user_id']][] = $s;
        }
        $users = Database::pdo()->query(
            "SELECT DISTINCT u.id, u.name, u.deleted_at FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN user_modules m ON m.user_id = u.id AND m.module = 'attendance'
             WHERE r.slug NOT IN ('attendance_display','superadmin')
               AND ((u.is_active = 1 AND u.deleted_at IS NULL AND m.user_id IS NOT NULL)
                    OR u.id IN (" . (implode(',', array_map('intval', array_keys($byUser))) ?: '0') . '))
             ORDER BY u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $employees = [];
        foreach ($users as $u) {
            $days = $this->days($byUser[(int) $u['id']] ?? []);
            $worked = 0;
            $incomplete = 0;
            foreach ($days as $d) {
                if ($d['worked_seconds'] === null) {
                    $incomplete++;
                } else {
                    $worked += $d['worked_seconds'];
                }
            }
            $employees[] = [
                'user_id' => (int) $u['id'],
                'name' => Policy::personName((string) $u['name'], $u['deleted_at']),
                'days' => $days,
                'worked_seconds' => $worked,
                'incomplete_days' => $incomplete,
            ];
        }

        return ['period' => $period, 'days_in_month' => (int) date('t', (int) strtotime($period . '-01')), 'employees' => $employees];
    }

    /** Strict local wall time: real calendar date, no overflow (2026-11-31), no zone suffix. */
    private static function parseLocal(mixed $value, string $label): string
    {
        $v = trim((string) $value);
        $tz = new \DateTimeZone(AttendanceClock::TZ);
        foreach (['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d\TH:i:s', 'Y-m-d\TH:i'] as $fmt) {
            $d = \DateTimeImmutable::createFromFormat('!' . $fmt, $v, $tz);
            $errors = \DateTimeImmutable::getLastErrors();
            $clean = $errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0);
            if ($d !== false && $clean && $d->format($fmt) === $v) {
                return $d->format('Y-m-d H:i:s');
            }
        }
        throw new AppException("Неверное время: {$label}", 422);
    }

    /** Version of a shift row for the owner's edit form (stale form → 409). */
    public static function rev(array $row): string
    {
        return substr(hash('sha256', implode('|', [$row['in_at_utc'], $row['out_at_utc'] ?? '', $row['status'], $row['edited_at'] ?? ''])), 0, 16);
    }

    /** Same named lock as the employee scan, so a correction never interleaves with a check-in/out. */
    private function lock(int $uid): void
    {
        if ((int) Database::pdo()->query("SELECT GET_LOCK('demo_att_u{$uid}', " . max(0, $this->lockWait) . ')')->fetchColumn() !== 1) {
            throw $this->err('busy_retry', 'Повторите через секунду', 409);
        }
    }

    private function unlock(int $uid): void
    {
        Database::pdo()->query("SELECT RELEASE_LOCK('demo_att_u{$uid}')");
    }

    /**
     * Rejects a shift that overlaps another shift of the same employee and day.
     * An active open shift reserves [arrival, end of its work day): the employee may still check out at any time.
     * An incomplete shift (forgotten leave) counts as the single moment of its arrival. Nothing is invented.
     */
    private function assertNoOverlap(int $userId, string $workDate, string $inUtc, ?string $outUtc, ?int $exceptId, bool $newIsOpen = false, ?string $code = null): void
    {
        $stmt = Database::pdo()->prepare('SELECT id, in_at_utc, out_at_utc, status FROM attendance_shifts WHERE user_id = ? AND work_date = ? AND id <> ? FOR UPDATE');
        $stmt->execute([$userId, $workDate, $exceptId ?? 0]);
        $dayEnd = AttendanceClock::unix(AttendanceClock::localToUtc($workDate . ' 00:00:00')) + 86400;
        $a1 = AttendanceClock::unix($inUtc);
        $a2 = $outUtc !== null ? AttendanceClock::unix($outUtc) : ($newIsOpen ? $dayEnd : $a1);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $o) {
            $b1 = AttendanceClock::unix((string) $o['in_at_utc']);
            $b2 = $o['out_at_utc'] !== null ? AttendanceClock::unix((string) $o['out_at_utc']) : ($o['status'] === 'open' ? $dayEnd : $b1);
            $hit = $a1 === $b1
                || ($a1 < $b2 && $b1 < $a2)          // proper intervals intersect
                || ($a1 === $a2 && $b1 < $a1 && $a1 < $b2) // new point inside other
                || ($b1 === $b2 && $a1 < $b1 && $b1 < $a2); // other point inside new
            if ($hit) {
                $msg = 'Смена пересекается с другой сменой '
                    . substr(AttendanceClock::local((string) $o['in_at_utc']), 11, 5) . '–'
                    . ($o['out_at_utc'] !== null ? substr(AttendanceClock::local((string) $o['out_at_utc']), 11, 5) : '…');
                if ($code !== null) {
                    throw $this->err($code, $msg . '. Отметка не записана — обратитесь к владельцу', 409);
                }
                throw new AppException($msg, 422);
            }
        }
    }

    /** @return array{0:string,1:?string} validated UTC in/out (same working day, out after in) */
    private static function validateTimes(string $inLocal, ?string $outLocal): array
    {
        $inUtc = AttendanceClock::localToUtc($inLocal);
        if ($outLocal === null) {
            return [$inUtc, null];
        }
        $outUtc = AttendanceClock::localToUtc($outLocal);
        if (AttendanceClock::unix($outUtc) <= AttendanceClock::unix($inUtc)) {
            throw new AppException('Уход должен быть позже прихода', 422);
        }
        if (AttendanceClock::workDate($outUtc) !== AttendanceClock::workDate($inUtc)) {
            throw new AppException('Приход и уход должны быть в один день (ночных смен нет)', 422);
        }

        return [$inUtc, $outUtc];
    }

    private static function comment(array $input): string
    {
        $c = trim((string) ($input['comment'] ?? ''));
        if ($c === '') {
            throw new AppException('Укажите причину исправления', 422);
        }

        return mb_substr($c, 0, 500);
    }

    /** Owner correction of one shift. Scan events stay untouched; before/after go to the audit log. */
    public function editShift(array $actor, int $id, array $input): array
    {
        AttendanceDisplayService::requireAdmin($actor);
        $comment = self::comment($input);
        $rev = (string) ($input['rev'] ?? '');
        if ($rev === '') {
            throw new AppException('Обновите табель и повторите', 422);
        }
        $pdo = Database::pdo();
        $owner = $pdo->prepare('SELECT user_id FROM attendance_shifts WHERE id = ?');
        $owner->execute([$id]);
        $uid = $owner->fetchColumn();
        if ($uid === false) {
            throw new AppException('Смена не найдена', 404);
        }
        $uid = (int) $uid;
        $this->lock($uid);
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('SELECT * FROM attendance_shifts WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $old = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$old || (int) $old['user_id'] !== $uid) {
                throw new AppException('Смена не найдена', 404);
            }
            if (!hash_equals(self::rev($old), $rev)) {
                throw $this->err('stale_form', 'Смена уже изменилась (отметка сотрудника или другое исправление). Обновите табель', 409);
            }
            $inLocal = array_key_exists('in_local', $input) && $input['in_local'] !== null && $input['in_local'] !== ''
                ? self::parseLocal($input['in_local'], 'приход') : AttendanceClock::local((string) $old['in_at_utc']);
            if (array_key_exists('out_local', $input)) {
                $outLocal = $input['out_local'] === null || $input['out_local'] === '' ? null : self::parseLocal($input['out_local'], 'уход');
            } else {
                $outLocal = $old['out_at_utc'] ? AttendanceClock::local((string) $old['out_at_utc']) : null;
            }
            [$inUtc, $outUtc] = self::validateTimes($inLocal, $outLocal);
            $workDate = AttendanceClock::workDate($inUtc);
            $this->assertNoOverlap($uid, $workDate, $inUtc, $outUtc, $id, $outUtc === null && $old['status'] === 'open');
            $status = $outUtc !== null ? 'closed' : ($old['status'] === 'open' ? 'open' : 'incomplete');
            $pdo->prepare('UPDATE attendance_shifts SET work_date = ?, in_at_utc = ?, out_at_utc = ?, status = ?, edited_by = ?, edited_at = NOW(), edit_comment = ? WHERE id = ?')
                ->execute([$workDate, $inUtc, $outUtc, $status, (int) $actor['user_id'], $comment, $id]);
            $this->audit->log((int) $actor['user_id'], 'attendance_shift', (string) $id, 'edit',
                ['in_at_utc' => $old['in_at_utc'], 'out_at_utc' => $old['out_at_utc'], 'status' => $old['status']],
                ['in_at_utc' => $inUtc, 'out_at_utc' => $outUtc, 'status' => $status, 'comment' => $comment]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        } finally {
            $this->unlock($uid);
        }

        return ['id' => $id, 'status' => $status];
    }

    /** Owner adds a missing shift (e.g. scanner did not work). */
    public function addShift(array $actor, array $input): array
    {
        AttendanceDisplayService::requireAdmin($actor);
        $comment = self::comment($input);
        $userId = (int) ($input['user_id'] ?? 0);
        $u = Database::pdo()->prepare('SELECT r.slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?');
        $u->execute([$userId]);
        $slug = $u->fetchColumn();
        if ($slug === false || $slug === Policy::DISPLAY_ROLE) {
            throw new AppException('Сотрудник не найден', 422);
        }
        $inLocal = self::parseLocal($input['in_local'] ?? '', 'приход');
        $outLocal = isset($input['out_local']) && $input['out_local'] !== '' ? self::parseLocal($input['out_local'], 'уход') : null;
        [$inUtc, $outUtc] = self::validateTimes($inLocal, $outLocal);
        $status = $outUtc !== null ? 'closed' : 'incomplete';
        $workDate = AttendanceClock::workDate($inUtc);
        $pdo = Database::pdo();
        $this->lock($userId);
        try {
            $pdo->beginTransaction();
            $this->assertNoOverlap($userId, $workDate, $inUtc, $outUtc, null);
            $pdo->prepare('INSERT INTO attendance_shifts (user_id, work_date, in_at_utc, out_at_utc, status, edited_by, edited_at, edit_comment) VALUES (?,?,?,?,?,?,NOW(),?)')
                ->execute([$userId, $workDate, $inUtc, $outUtc, $status, (int) $actor['user_id'], $comment]);
            $id = (int) $pdo->lastInsertId();
            $this->audit->log((int) $actor['user_id'], 'attendance_shift', (string) $id, 'create', null,
                ['user_id' => $userId, 'in_at_utc' => $inUtc, 'out_at_utc' => $outUtc, 'comment' => $comment]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        } finally {
            $this->unlock($userId);
        }

        return ['id' => $id, 'status' => $status];
    }

    /** @return array{name:string,body:string} */
    public function export(array $actor, mixed $period): array
    {
        // Detailed export with raw QR marks stays owner/superadmin only (keepers get the formatted timesheet later).
        AttendanceDisplayService::requireAdmin($actor);
        $r = $this->reportData(self::period($period));
        $n = $r['days_in_month'];
        $head = ['Сотрудник'];
        for ($d = 1; $d <= $n; $d++) {
            $head[] = (string) $d;
        }
        array_push($head, 'Итого часов', 'Нерассчитанных дней');
        $sheet = [$head];
        $marks = [['Сотрудник', 'Дата', 'Приход', 'Уход', 'Статус смены', 'Часы дня (после обеда)', 'Комментарий']];
        foreach ($r['employees'] as $e) {
            $line = [$e['name']];
            $byDate = array_column($e['days'], null, 'work_date');
            for ($d = 1; $d <= $n; $d++) {
                $day = $byDate[sprintf('%s-%02d', $r['period'], $d)] ?? null;
                $line[] = $day === null ? null : ($day['worked_seconds'] === null ? 'не завершён' : round($day['worked_seconds'] / 3600, 2));
            }
            array_push($line, round($e['worked_seconds'] / 3600, 2), $e['incomplete_days']);
            $sheet[] = $line;
            foreach ($e['days'] as $day) {
                foreach ($day['shifts'] as $s) {
                    $marks[] = [$e['name'], $day['work_date'], substr($s['in_local'], 11, 5), $s['out_local'] ? substr($s['out_local'], 11, 5) : '—',
                        ['open' => 'открыта', 'closed' => 'закрыта', 'incomplete' => 'не завершена'][$s['status']] ?? $s['status'],
                        $day['worked_seconds'] === null ? 'не рассчитано' : round($day['worked_seconds'] / 3600, 2), $s['edit_comment'] ?? ''];
                }
            }
        }
        $sheet[] = [];
        $sheet[] = ['Часы дня = сумма смен минус 1 ч обеда (один раз за полностью закрытый день). Время — Asia/Qyzylorda (UTC+5).'];

        return ['name' => 'attendance-' . $r['period'] . '.xlsx', 'body' => XlsxWriter::build(['Табель ' . $r['period'] => $sheet, 'Отметки' => $marks])];
    }
}
