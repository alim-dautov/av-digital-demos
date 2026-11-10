<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;
use Trx\Domain\AttendanceClock;
use Trx\Domain\TimesheetSheet;

/**
 * Task 6 HTTP-facing timesheet operations: authorization and input validation happen here, before the
 * trusted services (TimesheetArchiveService::create performs no authorization by contract).
 * Rights (spec §9): view/download/archive/codes = admin (owner or superadmin) or delegated keeper;
 * requisites = admin only. Detailed export with raw marks stays in AttendanceService::export (admin only).
 */
final class TimesheetApiService
{
    public const ORG_TITLE_MAX = 255;
    public const COMMENT_MAX = 500;

    public function __construct(
        private readonly TimesheetCodeService $codes = new TimesheetCodeService(),
        private readonly ?TimesheetArchiveService $archive = null,
    ) {
    }

    private function archive(): TimesheetArchiveService
    {
        return $this->archive ?? new TimesheetArchiveService();
    }

    /** @return array{name:string,body:string} formatted timesheet (customer template) for a month */
    public function timesheetFile(array $actor, mixed $period): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $p = self::period($period);
        $model = (new TimesheetDataService())->model($p);

        return ['name' => "tabel-{$p}.xlsx", 'body' => TimesheetSheet::build($model, new \DateTimeImmutable('now', new \DateTimeZone(AttendanceClock::TZ)))];
    }

    /** @return array<string,mixed> */
    public function setCode(array $actor, array $body): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $uid = $body['user_id'] ?? null;
        if (is_string($uid) && ctype_digit($uid)) {
            $uid = (int) $uid;
        }
        if (!is_int($uid) || $uid <= 0) {
            throw new AppException('Укажите сотрудника', 422);
        }
        $date = $body['work_date'] ?? null;
        if (!is_string($date) || strlen($date) !== 10) {
            throw new AppException('Дата должна быть ГГГГ-ММ-ДД', 422);
        }
        $code = $body['code'] ?? null;
        if ($code !== null && !is_string($code)) {
            throw new AppException('Неизвестный код', 422);
        }
        $comment = $body['comment'] ?? null;
        if ($comment !== null && (!is_string($comment) || mb_strlen($comment) > self::COMMENT_MAX)) {
            throw new AppException('Комментарий: строка до ' . self::COMMENT_MAX . ' символов', 422);
        }
        $rev = $body['rev'] ?? null;
        if (!is_string($rev) || $rev === '' || strlen($rev) > 32) {
            throw new AppException('Нужна версия (rev) из табеля', 422);
        }
        $confirm = ($body['confirm_conflict'] ?? false) === true;

        return $this->codes->setCode($actor, $uid, $date, $code === '' ? null : $code, $comment, $confirm, $rev);
    }

    /** @return array{items:list<array<string,mixed>>,failed_periods:list<string>} */
    public function archiveList(array $actor, mixed $period): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $a = $this->archive();

        return ['items' => $a->list($actor, self::period($period)), 'failed_periods' => $a->failedPeriods()];
    }

    /**
     * Manual «Сохранить новую ревизию»: the authorization guard for the trusted create().
     * Allowed: a closed month or the current month (Asia/Qyzylorda), and not before timesheet_archive_from.
     *
     * @return array{id:int,period:string,revision:int}
     */
    public function archiveCreate(array $actor, array $body): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        $raw = $body['period'] ?? null;
        if (!is_string($raw) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $raw)) {
            throw new AppException('Период должен быть в формате ГГГГ-ММ', 422);
        }
        $now = new \DateTimeImmutable('now', new \DateTimeZone(AttendanceClock::TZ));
        if ($raw > $now->format('Y-m')) {
            throw new AppException('Будущий месяц сохранить нельзя', 422);
        }
        $from = json_decode((string) Database::pdo()->query("SELECT `value` FROM settings WHERE `key` = 'timesheet_archive_from'")->fetchColumn(), true);
        if (is_string($from) && $raw < $from) {
            throw new AppException('Архив ведётся с ' . $from, 422);
        }

        return $this->archive()->create($raw, 'manual', (int) $actor['user_id'], $now);
    }

    /** @return array{name:string,path:string} */
    public function archiveFile(array $actor, mixed $id): array
    {
        AttendanceDisplayService::requireTimesheetViewer($actor);
        if (!is_string($id) || !ctype_digit($id) || strlen($id) > 10) {
            throw new AppException('Не найдено', 404);
        }

        return $this->archive()->file($actor, (int) $id);
    }

    /** @return array{org_title:string} */
    public function requisites(array $actor): array
    {
        AttendanceDisplayService::requireAdmin($actor);

        return ['org_title' => (string) (self::requisitesRow()['org_title'] ?? '')];
    }

    /** @return array{org_title:string} */
    public function setRequisites(array $actor, array $body): array
    {
        AttendanceDisplayService::requireAdmin($actor);
        $t = $body['org_title'] ?? null;
        if (!is_string($t)) {
            throw new AppException('Укажите наименование организации строкой', 422);
        }
        $t = trim($t);
        if (mb_strlen($t) > self::ORG_TITLE_MAX) {
            throw new AppException('Наименование: до ' . self::ORG_TITLE_MAX . ' символов', 422);
        }
        $row = self::requisitesRow();
        $row['org_title'] = $t;
        Database::pdo()->prepare("UPDATE settings SET `value` = ? WHERE `key` = 'timesheet_requisites'")
            ->execute([json_encode($row, JSON_UNESCAPED_UNICODE)]);

        return ['org_title' => $t];
    }

    /** @return array<string,mixed> */
    private static function requisitesRow(): array
    {
        $v = json_decode((string) Database::pdo()->query("SELECT `value` FROM settings WHERE `key` = 'timesheet_requisites'")->fetchColumn(), true);

        return is_array($v) ? $v : [];
    }

    private static function period(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $value)) {
            throw new AppException('Период должен быть в формате ГГГГ-ММ', 422);
        }

        return $value;
    }
}
