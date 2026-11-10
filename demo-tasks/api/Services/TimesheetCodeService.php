<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;
use Trx\Domain\TimesheetSheet;
use Trx\Security\Policy;

/**
 * Manual day codes (Б О А К П Р Д В) and the delegated «Табельщик» right.
 * Codes are written under the same per-employee lock as QR scans and shift edits, in one transaction with the audit row.
 * Only the real owner grants or revokes the keeper right.
 */
final class TimesheetCodeService
{
    public function __construct(
        private readonly AttendanceService $attendance = new AttendanceService(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /**
     * Optimistic-lock token for one employee/day: «none» only before the first change ever,
     * then «v{n}» from attendance_day_code_versions, which only grows (also on clear).
     */
    public static function rev(int $version): string
    {
        return $version <= 0 ? 'none' : 'v' . $version;
    }

    private static function noAmbientTransaction(\PDO $pdo): void
    {
        if ($pdo->inTransaction()) {
            throw new \LogicException('TimesheetCodeService must not run inside a caller transaction');
        }
    }

    /** @return array{user_id:int,work_date:string,code:?string,rev:string} */
    public function setCode(array $actor, int $userId, string $date, ?string $code, ?string $comment, bool $confirmConflict, string $expectedRev): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) {
            throw new AppException('Дата должна быть ГГГГ-ММ-ДД', 422);
        }
        if ($code !== null && !in_array($code, TimesheetSheet::CODES, true)) {
            throw new AppException('Неизвестный код', 422);
        }
        $comment = $comment === null || trim($comment) === '' ? null : mb_substr(trim($comment), 0, 500);
        $pdo = Database::pdo();
        self::noAmbientTransaction($pdo);
        $t = $pdo->prepare("SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND r.slug NOT IN ('attendance_display','superadmin')");
        $t->execute([$userId]);
        if (!$t->fetchColumn()) {
            throw new AppException('Сотрудник не найден', 404);
        }

        return $this->attendance->withUserLock($userId, function () use ($pdo, $actor, $userId, $date, $code, $comment, $confirmConflict, $expectedRev): array {
            $pdo->beginTransaction();
            try {
                $ver = $pdo->prepare('SELECT version FROM attendance_day_code_versions WHERE user_id = ? AND work_date = ? FOR UPDATE');
                $ver->execute([$userId, $date]);
                $version = (int) $ver->fetchColumn();
                $cur = $pdo->prepare('SELECT code, comment FROM attendance_day_codes WHERE user_id = ? AND work_date = ? FOR UPDATE');
                $cur->execute([$userId, $date]);
                $old = $cur->fetch(\PDO::FETCH_ASSOC) ?: null;
                if (!hash_equals(self::rev($version), $expectedRev)) {
                    throw new AppException('Код уже изменили, обновите табель', 409, ['code' => 'stale_code', 'rev' => self::rev($version)]);
                }
                if ($code !== null && !$confirmConflict) {
                    $m = $pdo->prepare('SELECT 1 FROM attendance_shifts WHERE user_id = ? AND work_date = ? LIMIT 1');
                    $m->execute([$userId, $date]);
                    if ($m->fetchColumn()) {
                        throw new AppException('В этот день есть QR-отметки. Подтвердите код', 409, ['code' => 'day_has_marks']);
                    }
                }
                if ($code === null) {
                    $pdo->prepare('DELETE FROM attendance_day_codes WHERE user_id = ? AND work_date = ?')->execute([$userId, $date]);
                } else {
                    $pdo->prepare(
                        'INSERT INTO attendance_day_codes (user_id, work_date, code, comment, set_by, set_at) VALUES (?,?,?,?,?,NOW())
                         ON DUPLICATE KEY UPDATE code = VALUES(code), comment = VALUES(comment), set_by = VALUES(set_by), set_at = NOW()'
                    )->execute([$userId, $date, $code, $comment, (int) $actor['user_id']]);
                }
                $this->audit->log(
                    (int) $actor['user_id'],
                    'attendance_day_code',
                    "{$userId}:{$date}",
                    $code === null ? 'clear' : 'set',
                    $old,
                    $code === null ? null : ['code' => $code, 'comment' => $comment, 'confirm_conflict' => $confirmConflict],
                );
                $pdo->prepare(
                    'INSERT INTO attendance_day_code_versions (user_id, work_date, version) VALUES (?, ?, 1)
                     ON DUPLICATE KEY UPDATE version = version + 1'
                )->execute([$userId, $date]);
                $pdo->commit();

                return ['user_id' => $userId, 'work_date' => $date, 'code' => $code, 'rev' => self::rev($version + 1)];
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        });
    }

    public function grantKeeper(array $actor, int $userId): void
    {
        if (!Policy::isRealOwner($actor)) {
            throw new AppException('Выдавать право может только владелец', 403);
        }
        $pdo = Database::pdo();
        self::noAmbientTransaction($pdo);
        $st = $pdo->prepare(
            "SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id JOIN user_modules m ON m.user_id = u.id AND m.module = 'attendance'
             WHERE u.id = ? AND r.slug = 'employee' AND u.is_active = 1 AND u.deleted_at IS NULL"
        );
        $st->execute([$userId]);
        if (!$st->fetchColumn()) {
            throw new AppException('Право можно дать только активному сотруднику с разделом «Посещаемость»', 409);
        }
        $this->atomically($pdo, function () use ($pdo, $actor, $userId): void {
            $pdo->prepare('INSERT IGNORE INTO attendance_keepers (user_id, granted_by) VALUES (?, ?)')->execute([$userId, (int) $actor['user_id']]);
            $this->audit->log((int) $actor['user_id'], 'attendance_keeper', (string) $userId, 'grant', null, null);
        });
    }

    public function revokeKeeper(array $actor, int $userId): void
    {
        if (!Policy::isRealOwner($actor)) {
            throw new AppException('Снимать право может только владелец', 403);
        }
        $pdo = Database::pdo();
        self::noAmbientTransaction($pdo);
        $this->atomically($pdo, function () use ($pdo, $actor, $userId): void {
            $pdo->prepare('DELETE FROM attendance_keepers WHERE user_id = ?')->execute([$userId]);
            $this->audit->log((int) $actor['user_id'], 'attendance_keeper', (string) $userId, 'revoke', null, null);
        });
    }

    /** Permission change and its audit row commit together or not at all. */
    private function atomically(\PDO $pdo, \Closure $fn): void
    {
        $pdo->beginTransaction();
        try {
            $fn();
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** @return list<array{user_id:int,name:string}> */
    public function keepers(array $actor): array
    {
        AttendanceDisplayService::requireAdmin($actor);
        $rows = Database::pdo()->query(
            'SELECT k.user_id, u.name FROM attendance_keepers k JOIN users u ON u.id = k.user_id WHERE u.deleted_at IS NULL ORDER BY u.name'
        )->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        return array_map(static fn (array $r): array => ['user_id' => (int) $r['user_id'], 'name' => (string) $r['name']], $rows);
    }
}
