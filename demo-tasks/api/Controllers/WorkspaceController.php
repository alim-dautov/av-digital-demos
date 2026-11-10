<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\NotificationService;
use Trx\Services\TaskRecurrenceService;
use Trx\Services\TaskTemplateService;
use Trx\Services\UserPrefsService;
use Trx\Services\WorkCalendarService;

final class WorkspaceController
{
    public function __construct(
        private readonly TaskTemplateService $templates = new TaskTemplateService(),
        private readonly TaskRecurrenceService $recurrences = new TaskRecurrenceService(),
        private readonly UserPrefsService $prefs = new UserPrefsService(),
        private readonly NotificationService $notifications = new NotificationService(),
        private readonly WorkCalendarService $calendar = new WorkCalendarService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function calendar(Request $request, array $user): void
    {
        $this->guard(fn () => $this->calendar->overview($user));
    }

    /** @param array<string, mixed> $user */
    public function addHoliday(Request $request, array $user): void
    {
        $this->guard(fn () => $this->calendar->addHoliday($user, $request->body));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function deleteHoliday(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->calendar->deleteHoliday($user, (string) $params['day']));
    }

    /** @param array<string, mixed> $user */
    public function addVacation(Request $request, array $user): void
    {
        $this->guard(fn () => $this->calendar->addVacation($user, $request->body));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function deleteVacation(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->calendar->deleteVacation($user, (int) $params['id']));
    }

    /** @param array<string, mixed> $user */
    public function templates(Request $request, array $user): void
    {
        $this->guard(fn () => ['items' => $this->templates->list($user)]);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function saveTemplate(Request $request, array $user, array $params = []): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : null;
        $this->guard(fn () => $this->templates->save($user, $id, $request->body), $id === null ? 201 : 200);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function archiveTemplate(Request $request, array $user, array $params): void
    {
        $this->guard(function () use ($user, $params): array {
            $this->templates->archive($user, (int) $params['id']);

            return ['archived' => true];
        });
    }

    /** @param array<string, mixed> $user */
    public function recurrences(Request $request, array $user): void
    {
        $this->guard(fn () => ['items' => $this->recurrences->list($user)]);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function saveRecurrence(Request $request, array $user, array $params = []): void
    {
        $id = isset($params['id']) ? (int) $params['id'] : null;
        $this->guard(fn () => $this->recurrences->save($user, $id, $request->body), $id === null ? 201 : 200);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function deleteRecurrence(Request $request, array $user, array $params): void
    {
        $this->guard(function () use ($user, $params): array {
            $this->recurrences->delete($user, (int) $params['id']);

            return ['deleted' => true];
        });
    }

    /** @param array<string, mixed> $user */
    public function prefs(Request $request, array $user): void
    {
        $this->guard(fn () => $this->prefs->get((int) $user['user_id']));
    }

    /** @param array<string, mixed> $user */
    public function savePrefs(Request $request, array $user): void
    {
        $this->guard(fn () => $this->prefs->update((int) $user['user_id'], $request->body));
    }

    /** @param array<string, mixed> $user */
    public function notifications(Request $request, array $user): void
    {
        $this->guard(fn () => $this->notifications->list((int) $user['user_id']));
    }

    /** @param array<string, mixed> $user */
    public function readNotifications(Request $request, array $user): void
    {
        $ids = array_map('intval', (array) $request->input('ids', []));
        $this->guard(function () use ($user, $ids): array {
            $this->notifications->markRead((int) $user['user_id'], $ids);

            return $this->notifications->list((int) $user['user_id']);
        });
    }

    private function guard(callable $fn, int $status = 200): void
    {
        try {
            Response::json($fn(), $status);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }
}
