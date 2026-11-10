<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\StaffService;

final class StaffController
{
    public function __construct(private readonly StaffService $staff = new StaffService())
    {
    }

    /** @param array<string, mixed> $user */
    public function index(Request $request, array $user): void
    {
        unset($request);
        $this->run(fn () => ['items' => $this->staff->list($user)]);
    }

    /** @param array<string, mixed> $user */
    public function create(Request $request, array $user): void
    {
        $this->run(fn () => $this->staff->create($user, $request->body), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function update(Request $request, array $user, array $params): void
    {
        $id = self::id($params);
        if ($id === null) {
            Response::error('Сотрудник не найден', 404);

            return;
        }
        $fields = array_intersect_key($request->body, array_flip(['position', 'modules', 'see_all_tasks']));
        $this->run(fn () => $this->staff->update($user, $id, $fields));
    }

    /**
     * Route id must be a canonical positive decimal within INT UNSIGNED, checked BEFORE any cast
     * ("12junk", "+12", "012", "1e3", "0", overflow → null → 404).
     *
     * @param array<string, string> $params
     */
    private static function id(array $params): ?int
    {
        $raw = $params['id'] ?? null;
        if (!is_string($raw) || !preg_match('/^[1-9][0-9]{0,9}$/', $raw) || (int) $raw > 4294967295) {
            return null;
        }

        return (int) $raw;
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function remove(Request $request, array $user, array $params): void
    {
        unset($request);
        $id = self::id($params);
        if ($id === null) {
            Response::error('Сотрудник не найден', 404);

            return;
        }
        $this->run(fn () => $this->staff->remove($user, $id));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function resetPassword(Request $request, array $user, array $params): void
    {
        $id = self::id($params);
        if ($id === null) {
            Response::error('Сотрудник не найден', 404);

            return;
        }
        $password = $request->input('password');
        if (!is_string($password) || $password === '') {
            Response::error('Укажите новый пароль', 422);

            return;
        }
        $this->run(function () use ($user, $id, $password, $request): array {
            $this->staff->resetPassword($user, $id, $password, $request->ip());

            return ['ok' => true];
        });
    }

    /** @param callable(): array<string, mixed> $action */
    private function run(callable $action, int $status = 200): void
    {
        try {
            Response::json($action(), $status);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }
}
