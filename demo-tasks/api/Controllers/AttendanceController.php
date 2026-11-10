<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\AttendanceDisplayService;
use Trx\Services\AttendanceService;
use Trx\Services\TimesheetApiService;
use Trx\Services\TimesheetCodeService;

/** «Посещаемость»: QR screen, employee check-in/out, owner timesheet. */
final class AttendanceController
{
    public function __construct(
        private readonly AttendanceService $attendance = new AttendanceService(),
        private readonly AttendanceDisplayService $displays = new AttendanceDisplayService(),
        private readonly TimesheetApiService $timesheet = new TimesheetApiService(),
        private readonly TimesheetCodeService $codes = new TimesheetCodeService(),
    ) {
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function handle(string $action, Request $request, array $user, array $params = []): void
    {
        try {
            $id = (int) ($params['id'] ?? 0);
            [$data, $status] = match ($action) {
                'display.current' => [$this->displays->current($user), 200],
                'check' => [$this->attendance->check($user, $request->body, $request->ip(), $request->userAgent()), 200],
                'me' => [$this->attendance->mine($user, $request->query['period'] ?? null), 200],
                'report' => [$this->attendance->report($user, $request->query['period'] ?? null), 200],
                'shift.edit' => [$this->attendance->editShift($user, $id, $request->body), 200],
                'shift.add' => [$this->attendance->addShift($user, $request->body), 201],
                'displays.list' => [['items' => $this->displays->list($user)], 200],
                'displays.create' => [$this->displays->createAccount($user, $request->body), 201],
                'displays.revoke' => [(function () use ($user, $id): array {
                    $this->displays->revoke($user, $id);

                    return ['ok' => true];
                })(), 200],
                'codes.set' => [$this->timesheet->setCode($user, $request->body), 200],
                'archive.list' => [$this->timesheet->archiveList($user, $request->query['period'] ?? null), 200],
                'archive.create' => [$this->timesheet->archiveCreate($user, $request->body), 201],
                'requisites.get' => [$this->timesheet->requisites($user), 200],
                'requisites.set' => [$this->timesheet->setRequisites($user, $request->body), 200],
                'keepers.list' => [['items' => $this->codes->keepers($user)], 200],
                'keepers.grant', 'keepers.revoke' => [(function () use ($action, $user, $params): null {
                    $raw = (string) ($params['userId'] ?? '');
                    if (!ctype_digit($raw) || strlen($raw) > 10 || (int) $raw <= 0) {
                        throw new AppException('Неверный сотрудник', 422);
                    }
                    $action === 'keepers.grant' ? $this->codes->grantKeeper($user, (int) $raw) : $this->codes->revokeKeeper($user, (int) $raw);

                    return null;
                })(), 204],
                default => throw new AppException('Не найдено', 404),
            };
            if ($status === 204) {
                http_response_code(204);

                return;
            }
            if ($action === 'display.current') {
                header('Cache-Control: no-store');
            }
            Response::json($data, $status);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status, $e->extra);
        }
    }

    /** Timesheet month as .xlsx (owner or superadmin). */
    public function export(Request $request, array $user, array $params): void
    {
        try {
            $file = $this->attendance->export($user, $params['period'] ?? null);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status, $e->extra);

            return;
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Length: ' . (string) strlen($file['body']));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Disposition: attachment; filename="' . $file['name'] . '"');
        echo $file['body'];
    }

    /** Formatted timesheet (customer template) — admin or keeper. Same download headers as export(). */
    public function timesheet(Request $request, array $user, array $params): void
    {
        unset($request);
        try {
            $file = $this->timesheet->timesheetFile($user, $params['period'] ?? null);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status, $e->extra);

            return;
        }
        self::fileHeaders($file['name'], strlen($file['body']));
        echo $file['body'];
    }

    /** Archived revision download — admin or keeper, only `ready`, realpath-checked inside the archive root. */
    public function archiveDownload(Request $request, array $user, array $params): void
    {
        unset($request);
        try {
            $file = $this->timesheet->archiveFile($user, $params['id'] ?? null);
            $fh = @fopen($file['path'], 'rb');
            $stat = $fh === false ? false : fstat($fh);
            if ($fh === false || $stat === false) {
                throw new AppException('Не найдено', 404);
            }
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status, $e->extra);

            return;
        }
        self::fileHeaders($file['name'], (int) $stat['size']); // length of the opened file itself, never a stored value
        fpassthru($fh);
        fclose($fh);
    }

    private static function fileHeaders(string $name, int $length): void
    {
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Length: ' . (string) $length);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Disposition: attachment; filename="' . $name . '"');
    }
}
