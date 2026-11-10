<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Config;
use Trx\Database;
use Trx\Domain\AttendanceClock;
use Trx\Domain\TimesheetSheet;

/**
 * Monthly timesheet archive: immutable numbered revisions under {paths.storage}/timesheets/YYYY-MM/rN.xlsx.
 *
 * Write protocol (spec §10): under GET_LOCK a `pending` row with a fresh, never-reused revision is inserted
 * first (hash/size NULL = not yet known); then the model snapshot is read (TimesheetDataService::model, own
 * read-only transaction, ambient transactions refused) and the XLSX is built in memory; any preparation error
 * marks the attempt `failed` (counted toward MAX_AUTO_FAILURES). The real SHA-256/size are stored, the bytes go
 * to rN.xlsx.part (fopen 'xb', every
 * write/flush/sync/close checked, then size+hash re-verified), the part is published with link() which
 * never replaces an existing target, then the row becomes `ready`. Any error before publication marks
 * the row `failed` and removes only our own .part. An error after publication leaves the row `pending`
 * for recoverStale(), which verifies the file and marks it `ready` without a new revision.
 * Revision numbers are never reused; existing files are never overwritten or deleted (a mismatching
 * final file is renamed to rN.xlsx.orphan-{id}).
 *
 * Clock: every time decision uses the caller's $now converted to AttendanceClock::TZ (Asia/Qyzylorda,
 * fixed UTC+5, no DST). created_at is written explicitly from that local wall time (not DB NOW()), and
 * recoverStale() compares against the same zone, so results do not depend on PHP's default zone or the
 * DB session zone. finished_at is informational (PHP wall clock in the same zone).
 */
final class TimesheetArchiveService
{
    public const RUN_AT = '00:15';
    public const MAX_AUTO_FAILURES = 3;
    public const STALE_MINUTES = 10;
    /** A `timesheet_archive` job still `processing` this long after its claim is treated as abandoned. */
    public const JOB_LEASE_MINUTES = 30;
    private const LOCK = 'demo_timesheet_archive';

    private string $root;

    /**
     * @param \Closure|null $beforeRename test hook, called with the verified .part path before publication
     * @param \Closure|null $afterRename  test hook, called after publication and before `ready`
     * @param \Closure|null $builder      fn(array $model, \DateTimeImmutable $now): string; defaults to TimesheetSheet::build
     * @param \Closure|null $fault        test hook fn(string $stage, string $path) at 'linked' (after link, before .part removal)
     */
    public function __construct(
        ?string $root = null,
        private readonly ?\Closure $beforeRename = null,
        private readonly ?\Closure $afterRename = null,
        private readonly int $lockWait = 10,
        private readonly ?\Closure $builder = null,
        private readonly ?\Closure $fault = null,
    ) {
        // DEMO_TIMESHEET_ROOT: optional override (used by the HTTP tests for an isolated temp archive); unset in production.
        $env = getenv('DEMO_TIMESHEET_ROOT');
        $this->root = rtrim($root ?? (is_string($env) && $env !== '' ? $env : (string) Config::get('paths.storage') . '/timesheets'), '/');
    }

    /** @return list<string> closed periods since feature start that still need an automatic archive, oldest first */
    public function duePeriods(\DateTimeImmutable $now): array
    {
        $pdo = Database::pdo();
        $from = json_decode((string) $pdo->query("SELECT `value` FROM settings WHERE `key` = 'timesheet_archive_from'")->fetchColumn(), true);
        if (!is_string($from) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $from)) {
            return [];
        }
        $tz = new \DateTimeZone(AttendanceClock::TZ);
        $local = $now->setTimezone($tz);
        $exhausted = array_flip(array_map('strval', $pdo->query(
            "SELECT period FROM attendance_timesheet_archives WHERE kind = 'auto' AND status = 'failed'
             GROUP BY period HAVING COUNT(*) >= " . self::MAX_AUTO_FAILURES
        )->fetchAll(\PDO::FETCH_COLUMN) ?: []));
        $have = $pdo->prepare("SELECT 1 FROM attendance_timesheet_archives WHERE period = ? AND kind = 'auto' AND status IN ('pending','ready') LIMIT 1");
        $out = [];
        for ($p = new \DateTimeImmutable($from . '-01 00:00:00', $tz); ; $p = $p->modify('first day of next month')) {
            $dueAt = new \DateTimeImmutable($p->modify('first day of next month')->format('Y-m-d') . ' ' . self::RUN_AT . ':00', $tz);
            if ($local < $dueAt) {
                break;
            }
            $period = $p->format('Y-m');
            $have->execute([$period]);
            if (!$have->fetchColumn() && !isset($exhausted[$period])) {
                $out[] = $period;
            }
        }

        return $out;
    }

    /** One run of the scheduled job: recover stale rows, then archive at most one (the oldest) due period. */
    public function runDue(\DateTimeImmutable $now): ?array
    {
        self::noAmbientTransaction();

        return $this->locked(function () use ($now): ?array {
            $this->recoverStale($now);
            $due = $this->duePeriods($now);

            return $due === [] ? null : $this->create($due[0], 'auto', null, $now);
        });
    }

    /** @return list<string> periods whose automatic archive failed MAX_AUTO_FAILURES times and has no ready revision */
    public function failedPeriods(): array
    {
        $rows = Database::pdo()->query(
            "SELECT period FROM attendance_timesheet_archives a WHERE kind = 'auto' AND status = 'failed'
               AND NOT EXISTS (SELECT 1 FROM attendance_timesheet_archives b WHERE b.period = a.period AND b.status = 'ready')
             GROUP BY period HAVING COUNT(*) >= " . self::MAX_AUTO_FAILURES . ' ORDER BY period'
        )->fetchAll(\PDO::FETCH_COLUMN) ?: [];

        return array_map('strval', $rows);
    }

    public function recoverStale(\DateTimeImmutable $now): int
    {
        self::noAmbientTransaction();

        return $this->locked(function () use ($now): int {
            $pdo = Database::pdo();
            $cut = self::local($now)->modify('-' . self::STALE_MINUTES . ' minutes')->format('Y-m-d H:i:s');
            $st = $pdo->prepare("SELECT id, file_rel, sha256, size FROM attendance_timesheet_archives WHERE status = 'pending' AND created_at < ? ORDER BY id");
            $st->execute([$cut]);
            $n = 0;
            foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $path = $this->root . '/' . $r['file_rel'];
                clearstatcache(true, $path);
                $exists = is_file($path) && !is_link($path);
                $ok = $exists && $r['sha256'] !== null && $r['size'] !== null
                    && filesize($path) === (int) $r['size'] && hash_file('sha256', $path) === $r['sha256'];
                if (!$ok && (is_file($path) || is_link($path))) {
                    $aside = $path . '.orphan-' . $r['id'];
                    if (file_exists($aside) || !rename($path, $aside)) {
                        continue; // leave pending; never overwrite or delete
                    }
                }
                // our own temp file, never a published revision; a failed removal is recorded, not hidden
                $partLeft = is_file($path . '.part') && !@unlink($path . '.part');
                $error = $ok ? ($partLeft ? 'part_not_removed' : null) : ($partLeft ? 'interrupted; part_not_removed' : 'interrupted');
                $pdo->prepare("UPDATE attendance_timesheet_archives SET status = ?, error = ?, finished_at = ? WHERE id = ? AND status = 'pending'")
                    ->execute([$ok ? 'ready' : 'failed', $error, self::wall(), (int) $r['id']]);
                $n++;
            }

            return $n;
        });
    }

    /**
     * Trusted internal entry point: performs NO authorization. Callers exposing a manual
     * «Сохранить новую ревизию» (Task 6 API) MUST first require a timesheet viewer
     * (AttendanceDisplayService::requireTimesheetViewer) and pass the actor id.
     *
     * @return array{id:int,period:string,revision:int}
     */
    public function create(string $period, string $kind, ?int $actorId, \DateTimeImmutable $now): array
    {
        self::noAmbientTransaction();
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period) || !in_array($kind, ['auto', 'manual'], true)) {
            throw new AppException('Неверный период', 422);
        }

        return $this->locked(function () use ($period, $kind, $actorId, $now): array {
            $pdo = Database::pdo();
            // The attempt is persisted first (own autocommit, before the read-only model snapshot) so that any
            // preparation failure (model, renderer, missing template) is counted with a never-reused revision.
            $st = $pdo->prepare('SELECT COALESCE(MAX(revision), 0) + 1 FROM attendance_timesheet_archives WHERE period = ?');
            $st->execute([$period]);
            $rev = (int) $st->fetchColumn();
            $rel = "{$period}/r{$rev}.xlsx";
            $pdo->prepare(
                "INSERT INTO attendance_timesheet_archives (period, revision, kind, status, file_rel, created_by, created_at) VALUES (?,?,?,'pending',?,?,?)"
            )->execute([$period, $rev, $kind, $rel, $actorId, self::local($now)->format('Y-m-d H:i:s')]);
            $id = (int) $pdo->lastInsertId();

            $part = null;
            $published = false;
            try {
                $model = (new TimesheetDataService())->model($period); // consistent read-only snapshot, no ambient TX
                $bytes = (string) ($this->builder !== null ? ($this->builder)($model, $now) : TimesheetSheet::build($model, $now));
                $sha = hash('sha256', $bytes);
                $size = strlen($bytes);
                $pdo->prepare("UPDATE attendance_timesheet_archives SET sha256 = ?, size = ?, employees = ?, incomplete_days = ?, conflicts = ? WHERE id = ? AND status = 'pending'")
                    ->execute([$sha, $size, count($model['employees']), $model['incomplete_days'], count($model['conflicts']), $id]);

                $dir = $this->root . '/' . $period;
                $old = umask(0007);
                try {
                    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
                        throw new \RuntimeException('Не создать каталог архива');
                    }
                } finally {
                    umask($old);
                }
                if (!chmod($dir, 0770)) {
                    throw new \RuntimeException('Не выставить права каталога архива');
                }
                $final = $this->root . '/' . $rel;
                $fh = @fopen($final . '.part', 'xb');
                if ($fh === false) {
                    throw new \RuntimeException('Не открыть временный файл');
                }
                $part = $final . '.part';
                $written = fwrite($fh, $bytes);
                $flushed = fflush($fh);
                $synced = fsync($fh);
                $closed = fclose($fh);
                if ($written !== $size || !$flushed || !$synced || !$closed) {
                    throw new \RuntimeException('Файл записан не полностью');
                }
                if (!chmod($part, 0640)) {
                    throw new \RuntimeException('Не выставить права файла');
                }
                if ($this->beforeRename !== null) {
                    ($this->beforeRename)($part);
                }
                clearstatcache(true, $part);
                if (filesize($part) !== $size || hash_file('sha256', $part) !== $sha) {
                    throw new \RuntimeException('Проверка файла не прошла');
                }
                if (file_exists($final) || is_link($final) || !@link($part, $final)) {
                    throw new \RuntimeException('Файл ревизии уже существует или не опубликован');
                }
                $published = true;
                if ($this->fault !== null) {
                    ($this->fault)('linked', $final);
                }
                if (!@unlink($part)) {
                    // Published and verified, but our temp file is still there: stay `pending` so recoverStale()
                    // re-verifies the final file, removes the .part and only then marks the revision ready.
                    $part = null;
                    throw new \RuntimeException('Временный файл не удалён после публикации');
                }
                $part = null;
                if ($this->afterRename !== null) {
                    ($this->afterRename)($final);
                }
                $pdo->prepare("UPDATE attendance_timesheet_archives SET status = 'ready', finished_at = ? WHERE id = ? AND status = 'pending'")->execute([self::wall(), $id]);

                return ['id' => $id, 'period' => $period, 'revision' => $rev];
            } catch (\Throwable $e) {
                if (!$published) {
                    $pdo->prepare("UPDATE attendance_timesheet_archives SET status = 'failed', error = ?, finished_at = ? WHERE id = ? AND status = 'pending'")
                        ->execute([mb_substr($e->getMessage(), 0, 255), self::wall(), $id]);
                }
                throw $e;
            } finally {
                if ($part !== null && is_file($part) && !@unlink($part)) {
                    $pdo->prepare("UPDATE attendance_timesheet_archives SET error = LEFT(CONCAT(COALESCE(error, ''), '; part_not_removed'), 255) WHERE id = ?")->execute([$id]);
                }
            }
        });
    }

    /**
     * Archive-specific lease for the existing job queue (called by Scheduler::tick before scheduling).
     * A `timesheet_archive` job still `processing` JOB_LEASE_MINUTES after its claim, while nobody holds the
     * archive lock (every runDue holds it for its whole run), belongs to a dead worker: it is closed as
     * `failed` with a visible reason (never re-queued, attempts unchanged), so the normal 15-minute schedule
     * can queue a fresh run whose recoverStale() resolves any pending archive row. Other job types are untouched.
     */
    public function reclaimAbandonedJob(): int
    {
        self::noAmbientTransaction();
        $pdo = Database::pdo();
        $st = $pdo->prepare('SELECT GET_LOCK(?, 0)');
        $st->execute([self::LOCK]);
        if ((int) $st->fetchColumn() !== 1) {
            return 0; // an archive run is active right now: never steal or duplicate it
        }
        try {
            $up = $pdo->prepare(
                // last_error FIRST: MariaDB evaluates single-table SET left to right, so it must read locked_by/at before they are cleared
                "UPDATE jobs SET last_error = CONCAT('abandoned: lease expired, worker ', COALESCE(locked_by, '?'), ' claimed at ', COALESCE(locked_at, '?')),
                        status = 'failed', locked_at = NULL, locked_by = NULL
                 WHERE type = 'timesheet_archive' AND status = 'processing' AND locked_at < NOW() - INTERVAL ? MINUTE"
            );
            $up->execute([self::JOB_LEASE_MINUTES]);

            return $up->rowCount();
        } finally {
            $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([self::LOCK]);
        }
    }

    /**
     * Fenced execution of a claimed `timesheet_archive` job. Under the archive lock (which reclaimAbandonedJob()
     * also needs) the claim is re-read: it must still be `processing`, owned by $workerId and carry the same
     * locked_at as when claimed. Otherwise the claim was reclaimed (or re-claimed) and nothing runs: returns
     * false so the caller must not ack. Because the recheck and the run hold the lock, a reclaim cannot slip in between.
     *
     * @return array{ran:true,result:?array}|false
     */
    public function runClaimed(int $jobId, string $workerId, ?string $claimedAt, \DateTimeImmutable $now): array|false
    {
        self::noAmbientTransaction();

        return $this->locked(function () use ($jobId, $workerId, $claimedAt, $now): array|false {
            $st = Database::pdo()->prepare("SELECT 1 FROM jobs WHERE id = ? AND type = 'timesheet_archive' AND status = 'processing' AND locked_by = ? AND locked_at <=> ?");
            $st->execute([$jobId, $workerId, $claimedAt]);
            if (!$st->fetchColumn()) {
                return false;
            }

            return ['ran' => true, 'result' => $this->runDue($now)];
        });
    }

    /** @return list<array<string,mixed>> */
    public function list(array $actor, string $period): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
            throw new AppException('Неверный период', 422);
        }
        $st = Database::pdo()->prepare(
            'SELECT id, period, revision, kind, status, size, employees, incomplete_days, conflicts, error, created_at
             FROM attendance_timesheet_archives WHERE period = ? ORDER BY revision DESC'
        );
        $st->execute([$period]);

        return $st->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array{name:string,path:string} only `ready` revisions, path resolved strictly inside the archive root */
    public function file(array $actor, int $id): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $st = Database::pdo()->prepare("SELECT period, revision, file_rel FROM attendance_timesheet_archives WHERE id = ? AND status = 'ready'");
        $st->execute([$id]);
        $r = $st->fetch(\PDO::FETCH_ASSOC);
        $base = realpath($this->root);
        $path = $r ? realpath($this->root . '/' . $r['file_rel']) : false;
        if (!$r || $base === false || $path === false || !is_file($path) || !str_starts_with($path, $base . DIRECTORY_SEPARATOR)) {
            throw new AppException('Не найдено', 404);
        }

        return ['name' => "tabel-{$r['period']}-r{$r['revision']}.xlsx", 'path' => $path];
    }

    private function locked(\Closure $fn): mixed
    {
        $pdo = Database::pdo();
        $st = $pdo->prepare('SELECT GET_LOCK(?, ?)');
        $st->execute([self::LOCK, $this->lockWait]);
        if ((int) $st->fetchColumn() !== 1) {
            throw new AppException('Табель уже сохраняется, повторите', 409);
        }
        try {
            return $fn();
        } finally {
            $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([self::LOCK]);
        }
    }

    private static function noAmbientTransaction(): void
    {
        if (Database::pdo()->inTransaction()) {
            throw new \LogicException('TimesheetArchiveService must not run inside a caller transaction');
        }
    }

    private static function local(\DateTimeImmutable $t): \DateTimeImmutable
    {
        return $t->setTimezone(new \DateTimeZone(AttendanceClock::TZ));
    }

    private static function wall(): string
    {
        return self::local(new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
    }
}
