<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;
use Trx\Domain\TimesheetSheet;
use Trx\Security\Policy;

/**
 * Builds the monthly timesheet model (TimesheetSheet::build input) from QR shifts and day codes.
 * All reads run in one consistent snapshot. Codes win over hours in a cell; a day with both is a conflict.
 * No QR data never becomes «В»/«П»; an open/incomplete day is «НЗ» without hours.
 */
final class TimesheetDataService
{
    public function __construct(private readonly ?AttendanceService $attendance = null)
    {
    }

    /**
     * @return array{period:string, org_title:string, employees:list<array{user_id:int,name:string,position:string,cells:array<int,float|string>}>,
     *   conflict_days:list<array{row:int,day:int}>, conflicts:list<array{user_id:int,work_date:string}>, incomplete_days:int,
     *   codes:list<array{user_id:int,work_date:string,code:string,rev:string}>,
     *   code_revs:list<array{user_id:int,work_date:string,rev:string}>, report:array<string,mixed>}
     */
    /*
     * Read/write contract for day codes:
     *  - codes: only days that currently carry a code (render these; never render a tombstone).
     *  - code_revs: the optimistic token for every day of a visible employee that has ever had a code,
     *    including cleared days (tombstones). Client token for cell (user_id, work_date) =
     *    code_revs lookup, or 'none' when the pair is absent. Send exactly that as `rev` to setCode;
     *    on 409 reload and take the token from code_revs again (never from codes).
     */
    public function model(string $period): array
    {
        $pdo = Database::pdo();
        // Contract: always our own REPEATABLE READ snapshot. A caller transaction (any isolation) is refused
        // before any read, and is never committed or rolled back here.
        if ($pdo->inTransaction()) {
            throw new \LogicException('TimesheetDataService::model must not run inside a caller transaction');
        }
        $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        try {
            $model = $this->read($pdo, $period);
            $pdo->commit();

            return $model;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    private function read(\PDO $pdo, string $period): array
    {
        $from = $period . '-01';
        $to = (new \DateTimeImmutable($from))->format('Y-m-t');
        $report = ($this->attendance ?? new AttendanceService())->reportData($period);

        // Driven by the versions table so a cleared day (code row deleted, version kept) still yields its token.
        // A version row without a code is a tombstone: it feeds code_revs only, never cells/codes/conflicts.
        $st = $pdo->prepare(
            'SELECT v.user_id, v.work_date, c.code, v.version FROM attendance_day_code_versions v
             LEFT JOIN attendance_day_codes c ON c.user_id = v.user_id AND c.work_date = v.work_date
             WHERE v.work_date BETWEEN ? AND ?
             UNION ALL
             SELECT c.user_id, c.work_date, c.code, 0 FROM attendance_day_codes c
             LEFT JOIN attendance_day_code_versions v ON v.user_id = c.user_id AND v.work_date = c.work_date
             WHERE c.work_date BETWEEN ? AND ? AND v.user_id IS NULL
             ORDER BY work_date, user_id'
        );
        $st->execute([$from, $to, $from, $to]);
        $codes = [];
        $codeList = [];
        $revList = [];
        foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $c) {
            $rev = TimesheetCodeService::rev((int) $c['version']);
            $revList[] = ['user_id' => (int) $c['user_id'], 'work_date' => (string) $c['work_date'], 'rev' => $rev];
            if ($c['code'] === null || $c['code'] === '') {
                continue;
            }
            $codes[(int) $c['user_id']][(int) substr((string) $c['work_date'], 8, 2)] = (string) $c['code'];
            $codeList[] = ['user_id' => (int) $c['user_id'], 'work_date' => (string) $c['work_date'], 'code' => (string) $c['code'], 'rev' => $rev];
        }

        $employees = $report['employees'];
        $missing = array_values(array_diff(array_keys($codes), array_column($employees, 'user_id')));
        if ($missing !== []) {
            $in = implode(',', array_map('intval', $missing));
            $rows = $pdo->query(
                "SELECT u.id, u.name, u.deleted_at FROM users u JOIN roles r ON r.id = u.role_id
                 WHERE u.id IN ({$in}) AND r.slug NOT IN ('attendance_display','superadmin')"
            )->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            foreach ($rows as $u) {
                $employees[] = ['user_id' => (int) $u['id'], 'name' => Policy::personName((string) $u['name'], $u['deleted_at']), 'days' => [], 'worked_seconds' => 0, 'incomplete_days' => 0];
            }
            usort($employees, static fn (array $a, array $b): int => strcmp((string) $a['name'], (string) $b['name']));
        }
        $visible = array_flip(array_map(static fn (array $e): int => (int) $e['user_id'], $employees));
        $codeList = array_values(array_filter($codeList, static fn (array $c): bool => isset($visible[$c['user_id']])));
        $revList = array_values(array_filter($revList, static fn (array $c): bool => isset($visible[$c['user_id']])));

        $pos = [];
        if ($visible !== []) {
            $rows = $pdo->query('SELECT id, position FROM users WHERE id IN (' . implode(',', array_keys($visible)) . ')')->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            foreach ($rows as $p) {
                $pos[(int) $p['id']] = (string) ($p['position'] ?? '');
            }
        }

        $out = [];
        $conflicts = [];
        $conflictDays = [];
        $incomplete = 0;
        foreach (array_values($employees) as $row => $e) {
            $uid = (int) $e['user_id'];
            $cells = [];
            foreach ($e['days'] as $d) {
                $cells[(int) substr((string) $d['work_date'], 8, 2)] = $d['worked_seconds'] === null
                    ? TimesheetSheet::INCOMPLETE
                    : TimesheetSheet::hours($d['worked_seconds'] / 3600);
            }
            foreach ($codes[$uid] ?? [] as $day => $code) {
                if (isset($cells[$day])) {
                    $conflicts[] = ['user_id' => $uid, 'work_date' => sprintf('%s-%02d', $period, $day)];
                    $conflictDays[] = ['row' => $row, 'day' => $day];
                }
                $cells[$day] = $code;
            }
            ksort($cells);
            $incomplete += count(array_filter($cells, static fn ($v): bool => $v === TimesheetSheet::INCOMPLETE));
            $out[] = ['user_id' => $uid, 'name' => (string) $e['name'], 'position' => $pos[$uid] ?? '', 'cells' => $cells];
        }

        // One authoritative roster for the UI report and the XLSX: base report rows + code-only (e.g. deleted) employees,
        // each with its position. Hidden accounts (superadmin, QR screens) are excluded by both sources.
        $report['employees'] = array_map(static fn (array $e): array => ['position' => $pos[(int) $e['user_id']] ?? ''] + $e, array_values($employees));

        $req = json_decode((string) $pdo->query("SELECT `value` FROM settings WHERE `key` = 'timesheet_requisites'")->fetchColumn(), true);

        return [
            'period' => $period,
            'org_title' => is_array($req) ? (string) ($req['org_title'] ?? '') : '',
            'employees' => $out,
            'conflict_days' => $conflictDays,
            'conflicts' => $conflicts,
            'incomplete_days' => $incomplete,
            'codes' => $codeList,
            'code_revs' => $revList,
            'report' => $report,
        ];
    }
}
