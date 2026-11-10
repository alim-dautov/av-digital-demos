<?php

declare(strict_types=1);

use Trx\Config;
use Trx\Controllers\ApiTokenController;
use Trx\Controllers\AuthController;
use Trx\Controllers\CrmController;
use Trx\Controllers\GrokSettingsController;
use Trx\Controllers\McpController;
use Trx\Controllers\MeController;
use Trx\Controllers\MetaController;
use Trx\Controllers\MiniChatController;
use Trx\Controllers\OutboxController;
use Trx\Controllers\PushController;
use Trx\Controllers\StaffController;
use Trx\Controllers\TasksController;
use Trx\Controllers\WorkspaceController;
use Trx\Http\AuthGate;
use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Http\Router;
use Trx\Security\Policy;
use Trx\Services\Migrator;

require dirname(__DIR__) . '/vendor/autoload.php';

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: ' . (string) Config::get('app.url', '*'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-Idempotency-Key, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    (new Migrator())->ensureUpToDate();
} catch (Throwable $e) {
    error_log('DEMO migrate: ' . $e->getMessage());
    Response::error('Обновление базы не завершено, попробуйте через минуту', 503);
    exit;
}

\Trx\Services\LazyRecurrence::maybeRun();

$request = Request::fromGlobals();
$gate = new AuthGate();
$router = new Router();

$authController = new AuthController();
$meController = new MeController();
$metaController = new MetaController();
$outboxController = new OutboxController();
$pushController = new PushController();
$tasksController = new TasksController();
$staffController = new StaffController();
$tokenController = new ApiTokenController();
$mcpController = new McpController();
$miniChatController = new MiniChatController();
$grokController = new GrokSettingsController();
$crmController = new CrmController();
$workspaceController = new WorkspaceController();
$attendanceController = new \Trx\Controllers\AttendanceController();

$allowModule = static function (Request $request, array $session): bool {
    // QR screen account: strict allowlist before anything else, module-less paths included.
    if (Policy::isDisplay($session)) {
        if (!Policy::displayAllows($request->method, $request->path)) {
            Response::error('Недостаточно прав', 403);

            return false;
        }

        return true;
    }
    $module = Policy::moduleForPath($request->path);
    if ($module === null) {
        return true;
    }
    if (Policy::isOwnerOnlyModule($module)) {
        // Grok Bot: only the real owner (Владелец), not employees and not the hidden superadmin.
        if (!Policy::isRealOwner($session)) {
            Response::error('Недостаточно прав', 403);

            return false;
        }

        return true;
    }
    if ($module === 'api_tokens') {
        // Owner or superadmin; ApiTokenService limits superadmin to KP-only tokens.
        if (!Policy::isAdmin($session)) {
            Response::error('Недостаточно прав', 403);

            return false;
        }

        return true;
    }
    if ($module === 'grok_settings') {
        // Grok Bot connection: only the real owner (Aziz), not the hidden superadmin.
        if (!Policy::isRealOwner($session)) {
            Response::error('Недостаточно прав', 403);

            return false;
        }

        return true;
    }
    if ($module === 'staff' || $module === 'team_admin') {
        if (($session['role_slug'] ?? '') !== 'owner') {
            Response::error('Недостаточно прав', 403);

            return false;
        }

        return true;
    }
    if (!(new Policy())->can($session, $module, 'view')) {
        Response::error('Недостаточно прав', 403);

        return false;
    }

    return true;
};

$guard = static function (bool $csrf, callable $handler) use ($gate, $allowModule): callable {
    return static function (Request $request, array $params = []) use ($csrf, $handler, $gate, $allowModule): void {
        $decision = $gate->decide($request, $csrf);
        if (!$decision['ok']) {
            if ($decision['retry_after'] > 0) {
                header('Retry-After: ' . $decision['retry_after']);
            }
            Response::error($decision['error'], $decision['status']);

            return;
        }
        if (!Policy::scopeAllowsPath((string) ($decision['user']['token_scope'] ?? 'full'), $request->path)) {
            Response::error('Этот API-ключ даёт доступ только к /api/kp', 403);

            return;
        }
        // A kp-scoped key is itself the grant for /kp (path already checked above).
        if (($decision['user']['token_scope'] ?? 'full') !== 'kp' && !$allowModule($request, $decision['user'])) {
            return;
        }
        $handler($request, $decision['user'], $params);
    };
};

$requireAuth = static fn (callable $handler): callable => $guard(false, $handler);
$requireCsrf = static fn (callable $handler): callable => $guard(true, $handler);

$router->add('GET', '/health', static fn (Request $r) => $metaController->health($r));
$router->add('POST', '/auth/login', static fn (Request $r) => $authController->login($r));
$router->add('POST', '/auth/logout', $requireCsrf(static function (Request $r, array $user) use ($authController): void {
    $authController->logout($r);
}));
$router->add('GET', '/me', $requireAuth(static function (Request $r, array $user) use ($meController): void {
    $meController->me($r, $user);
}));
$router->add('POST', '/me/password', $requireCsrf(static function (Request $r, array $user) use ($meController): void {
    $meController->changePassword($r, $user);
}));
$router->add('GET', '/staff', $requireAuth(static function (Request $r, array $user) use ($staffController): void {
    $staffController->index($r, $user);
}));
$router->add('POST', '/staff', $requireCsrf(static function (Request $r, array $user) use ($staffController): void {
    $staffController->create($r, $user);
}));
$router->add('PATCH', '/staff/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($staffController): void {
    $staffController->update($r, $user, $params);
}));
$router->add('DELETE', '/staff/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($staffController): void {
    $staffController->remove($r, $user, $params);
}));
$router->add('POST', '/staff/{id}/password', $requireCsrf(static function (Request $r, array $user, array $params) use ($staffController): void {
    $staffController->resetPassword($r, $user, $params);
}));
$router->add('GET', '/api-tokens', $requireAuth(static function (Request $r, array $user) use ($tokenController): void {
    $tokenController->index($r, $user);
}));
$router->add('POST', '/api-tokens', $requireCsrf(static function (Request $r, array $user) use ($tokenController): void {
    $tokenController->create($r, $user);
}));
$router->add('POST', '/api-tokens/{id}/revoke', $requireCsrf(static function (Request $r, array $user, array $params) use ($tokenController): void {
    $tokenController->revoke($r, $user, $params);
}));
$router->add('DELETE', '/api-tokens/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tokenController): void {
    $tokenController->delete($r, $user, $params);
}));
$router->add(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], '/mcp', static function (Request $r) use ($mcpController): void {
    $mcpController->handle($r);
});
$router->add('GET', '/mini-chat/messages', $requireAuth(static function (Request $r, array $user) use ($miniChatController): void {
    $miniChatController->index($r, $user);
}));
$router->add('POST', '/mini-chat/messages', $requireCsrf(static function (Request $r, array $user) use ($miniChatController): void {
    $miniChatController->store($r, $user);
}));
$router->add('GET', '/grok/settings', $requireAuth(static function (Request $r, array $user) use ($grokController): void {
    $grokController->show($r, $user);
}));
$router->add('PUT', '/grok/settings', $requireCsrf(static function (Request $r, array $user) use ($grokController): void {
    $grokController->save($r, $user);
}));
$router->add('POST', '/grok/test', $requireCsrf(static function (Request $r, array $user) use ($grokController): void {
    $grokController->test($r, $user);
}));
$router->add('GET', '/meta/nav', $requireAuth(static function (Request $r, array $user) use ($metaController): void {
    $metaController->nav($r, $user);
}));
$router->add('GET', '/meta/departments', $requireAuth(static function (Request $r, array $user) use ($metaController): void {
    $metaController->departments($r, $user);
}));
$router->add('POST', '/outbox', $requireCsrf(static function (Request $r, array $user) use ($outboxController): void {
    $outboxController->store($r, $user);
}));
$router->add('POST', '/push/subscribe', $requireCsrf(static function (Request $r, array $user) use ($pushController): void {
    $pushController->subscribe($r, $user);
}));
$router->add('POST', '/push/unsubscribe', $requireCsrf(static function (Request $r, array $user) use ($pushController): void {
    $pushController->unsubscribe($r, $user);
}));
$router->add('POST', '/push/test', $requireCsrf(static function (Request $r, array $user) use ($pushController): void {
    $pushController->test($r, $user);
}));
$router->add('GET', '/dashboard', $requireAuth(static function (Request $r, array $user) use ($tasksController): void {
    $tasksController->dashboard($r, $user);
}));
$router->add('GET', '/tasks', $requireAuth(static function (Request $r, array $user) use ($tasksController): void {
    $tasksController->index($r, $user);
}));
$router->add('GET', '/tasks/version', $requireAuth(static function (Request $r, array $user) use ($tasksController): void {
    $tasksController->version($r, $user);
}));
$router->add('GET', '/tasks/unseen-count', $requireAuth(static function (Request $r, array $user) use ($tasksController): void {
    $tasksController->unseenCount($r, $user);
}));
$router->add('POST', '/tasks', $requireCsrf(static function (Request $r, array $user) use ($tasksController): void {
    $tasksController->create($r, $user);
}));
$router->add('GET', '/tasks/{id}', $requireAuth(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->show($r, $user, $params);
}));
$router->add('POST', '/tasks/{id}/transition', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->transition($r, $user, $params);
}));
$router->add('POST', '/tasks/{id}/due', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->due($r, $user, $params);
}));
$router->add('POST', '/tasks/{id}/comments', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->comment($r, $user, $params);
}));
$router->add('POST', '/tasks/{id}/checklist', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->check($r, $user, $params);
}));
$router->add('POST', '/tasks/{id}/checklist/{item}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->toggleCheck($r, $user, $params);
}));
$router->add('PATCH', '/tasks/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->update($r, $user, $params);
}));
$router->add('DELETE', '/tasks/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->destroy($r, $user, $params);
}));
$router->add('DELETE', '/tasks/{id}/checklist/{item}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->removeCheck($r, $user, $params);
}));
$router->add('POST', '/comments/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->editComment($r, $user, $params);
}));
$router->add('GET', '/comment-attachments/{id}', $requireAuth(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->commentDownload($r, $user, $params);
}));
$router->add('POST', '/tasks/{id}/attachments', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->upload($r, $user, $params);
}));
$router->add('GET', '/attachments/{id}', $requireAuth(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->download($r, $user, $params);
}));
$router->add('DELETE', '/attachments/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($tasksController): void {
    $tasksController->deleteAttachment($r, $user, $params);
}));
$router->add('GET', '/meta/users', $requireAuth(static function (Request $r, array $user) use ($tasksController): void {
    $tasksController->users($r, $user);
}));
$router->add('GET', '/task-templates', $requireAuth(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->templates($r, $user);
}));
$router->add('POST', '/task-templates', $requireCsrf(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->saveTemplate($r, $user);
}));
$router->add('PUT', '/task-templates/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($workspaceController): void {
    $workspaceController->saveTemplate($r, $user, $params);
}));
$router->add('DELETE', '/task-templates/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($workspaceController): void {
    $workspaceController->archiveTemplate($r, $user, $params);
}));
$router->add('GET', '/task-recurrences', $requireAuth(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->recurrences($r, $user);
}));
$router->add('POST', '/task-recurrences', $requireCsrf(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->saveRecurrence($r, $user);
}));
$router->add('PUT', '/task-recurrences/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($workspaceController): void {
    $workspaceController->saveRecurrence($r, $user, $params);
}));
$router->add('DELETE', '/task-recurrences/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($workspaceController): void {
    $workspaceController->deleteRecurrence($r, $user, $params);
}));
$router->add('GET', '/work-calendar', $requireAuth(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->calendar($r, $user);
}));
$router->add('POST', '/work-calendar/holidays', $requireCsrf(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->addHoliday($r, $user);
}));
$router->add('DELETE', '/work-calendar/holidays/{day}', $requireCsrf(static function (Request $r, array $user, array $params) use ($workspaceController): void {
    $workspaceController->deleteHoliday($r, $user, $params);
}));
$router->add('POST', '/work-calendar/vacations', $requireCsrf(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->addVacation($r, $user);
}));
$router->add('DELETE', '/work-calendar/vacations/{id}', $requireCsrf(static function (Request $r, array $user, array $params) use ($workspaceController): void {
    $workspaceController->deleteVacation($r, $user, $params);
}));
$router->add('GET', '/me/prefs', $requireAuth(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->prefs($r, $user);
}));
$router->add('PUT', '/me/prefs', $requireCsrf(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->savePrefs($r, $user);
}));
$router->add('GET', '/notifications', $requireAuth(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->notifications($r, $user);
}));
$router->add('POST', '/notifications/read', $requireCsrf(static function (Request $r, array $user) use ($workspaceController): void {
    $workspaceController->readNotifications($r, $user);
}));
$router->add('GET', '/deals', $requireAuth(static function (Request $r, array $user) use ($crmController): void {
    $crmController->board($r, $user);
}));
$router->add('POST', '/deals', $requireCsrf(static function (Request $r, array $user) use ($crmController): void {
    $crmController->ingest($r, $user);
}));
$router->add('GET', '/deals/{id}', $requireAuth(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->show($r, $user, $params);
}));
$router->add('POST', '/deals/{id}/move', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->move($r, $user, $params);
}));
$router->add('POST', '/deals/{id}/items', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->addItem($r, $user, $params);
}));
$router->add('POST', '/deals/{id}/quotes', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->createQuote($r, $user, $params);
}));
$router->add('POST', '/quotes/{id}/send', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->sendQuote($r, $user, $params);
}));
$router->add('GET', '/quotes/{id}/html', $requireAuth(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->quoteHtml($r, $user, $params);
}));
$router->add('POST', '/deals/{id}/onec-order', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->pushOrder($r, $user, $params);
}));
$router->add('POST', '/integrations/onec/payments', $requireCsrf(static function (Request $r, array $user) use ($crmController): void {
    $crmController->oneCPayment($r, $user);
}));
$router->add('POST', '/orders/{id}/manual-payment', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->manualPayment($r, $user, $params);
}));
$router->add('POST', '/integrations/calls', $requireCsrf(static function (Request $r, array $user) use ($crmController): void {
    $crmController->call($r, $user);
}));
$router->add('POST', '/calls/{id}/analyze', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->analyze($r, $user, $params);
}));
$router->add('POST', '/calls/{id}/apply', $requireCsrf(static function (Request $r, array $user, array $params) use ($crmController): void {
    $crmController->applySuggestion($r, $user, $params);
}));
$router->add('POST', '/integrations/onec/sync', $requireCsrf(static function (Request $r, array $user) use ($crmController): void {
    $crmController->sync($r, $user);
}));
$router->add('GET', '/warehouse', $requireAuth(static function (Request $r, array $user) use ($crmController): void {
    $crmController->warehouse($r, $user);
}));
$router->add('GET', '/reports', $requireAuth(static function (Request $r, array $user) use ($crmController): void {
    $crmController->report($r, $user);
}));
$router->add('GET', '/reports/drill', $requireAuth(static function (Request $r, array $user) use ($crmController): void {
    $crmController->drill($r, $user);
}));
$insights = new \Trx\Controllers\InsightsController();
$router->add('GET', '/team', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('team', $r, $user, $params);
}));
$router->add('GET', '/team/{id}', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('team.profile', $r, $user, $params);
}));
$router->add('GET', '/kp', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.list', $r, $user, $params);
}));
$router->add('POST', '/kp', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.create', $r, $user, $params);
}));
$router->add('GET', '/kp/{id}', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.get', $r, $user, $params);
}));
$router->add('PATCH', '/kp/{id}', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.update', $r, $user, $params);
}));
$router->add('PUT', '/kp/{id}', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.update', $r, $user, $params);
}));
$router->add('GET', '/kp/{id}/pdf', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->kpPdf($r, $user, $params);
}));
$router->add('GET', '/settings/kp-company', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.company.get', $r, $user, $params);
}));
$router->add('PUT', '/settings/kp-company', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kp.company.save', $r, $user, $params);
}));
$router->add('GET', '/kpi', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.list', $r, $user, $params);
}));
$router->add('PUT', '/kpi/targets', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.save', $r, $user, $params);
}));
$router->add('GET', '/kpi/payroll', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.payroll', $r, $user, $params);
}));
$router->add('GET', '/kpi/salaries', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.salaries', $r, $user, $params);
}));
$router->add('PUT', '/kpi/salaries', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.salary.save', $r, $user, $params);
}));
$router->add('PUT', '/kpi/payroll/{period}/adjustments', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.adjust', $r, $user, $params);
}));
$router->add('POST', '/kpi/payroll/{period}/approve', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.approve', $r, $user, $params);
}));
$router->add('POST', '/kpi/payroll/{period}/reopen', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('kpi.reopen', $r, $user, $params);
}));
$router->add('GET', '/kpi/payroll/{period}/export', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->kpiExport($r, $user, $params);
}));
$router->add('GET', '/attendance/display/current', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('display.current', $r, $user, $params);
}));
$router->add('POST', '/attendance/check', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('check', $r, $user, $params);
}));
$router->add('GET', '/attendance/me', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('me', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/report', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('report', $r, $user, $params);
}));
$router->add('PUT', '/attendance/admin/shifts/{id}', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('shift.edit', $r, $user, $params);
}));
$router->add('POST', '/attendance/admin/shifts', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('shift.add', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/displays', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('displays.list', $r, $user, $params);
}));
$router->add('POST', '/attendance/admin/displays', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('displays.create', $r, $user, $params);
}));
$router->add('POST', '/attendance/admin/displays/{id}/revoke', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('displays.revoke', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/report/{period}/timesheet', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->timesheet($r, $user, $params);
}));
$router->add('PUT', '/attendance/admin/codes', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('codes.set', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/archive', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('archive.list', $r, $user, $params);
}));
$router->add('POST', '/attendance/admin/archive', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('archive.create', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/archive/{id}/download', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->archiveDownload($r, $user, $params);
}));
$router->add('GET', '/attendance/admin/requisites', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('requisites.get', $r, $user, $params);
}));
$router->add('PUT', '/attendance/admin/requisites', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('requisites.set', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/keepers', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('keepers.list', $r, $user, $params);
}));
$router->add('POST', '/attendance/admin/keepers/{userId}', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('keepers.grant', $r, $user, $params);
}));
$router->add('DELETE', '/attendance/admin/keepers/{userId}', $requireCsrf(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->handle('keepers.revoke', $r, $user, $params);
}));
$router->add('GET', '/attendance/admin/report/{period}/export', $requireAuth(static function (Request $r, array $user, array $params = []) use ($attendanceController): void {
    $attendanceController->export($r, $user, $params);
}));
$router->add('GET', '/analytics/tasks', $requireAuth(static function (Request $r, array $user, array $params = []) use ($insights): void {
    $insights->handle('analytics', $r, $user, $params);
}));
$whatsappController = new \Trx\Controllers\WhatsappController();
$router->add('POST', '/whatsapp/iframe', $requireCsrf(static function (Request $r, array $user) use ($whatsappController): void {
    $whatsappController->iframe($r, $user);
}));
$router->add('GET', '/whatsapp/channels', $requireAuth(static function (Request $r, array $user) use ($whatsappController): void {
    $whatsappController->channels($r, $user);
}));
$router->add('POST', '/bot/message', $requireCsrf(static function (Request $r, array $user) use ($crmController): void {
    $crmController->bot($r, $user);
}));
$router->add('POST', '/bot/return', $requireCsrf(static function (Request $r, array $user) use ($crmController): void {
    $crmController->botReturn($r, $user);
}));

try {
    $router->dispatch($request);
} catch (\Throwable $e) {
    $env = (string) Config::get('app.env', 'production');
    Response::json([
        'error' => 'Внутренняя ошибка сервера',
        'detail' => $env === 'local' ? $e->getMessage() : null,
    ], 500);
}
