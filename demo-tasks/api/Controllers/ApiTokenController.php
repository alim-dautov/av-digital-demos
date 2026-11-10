<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Auth\ApiTokenService;
use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;

final class ApiTokenController
{
    public function __construct(
        private readonly ApiTokenService $tokens = new ApiTokenService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function index(Request $request, array $user): void
    {
        $this->guard(fn (): array => ['items' => $this->tokens->list($user)]);
    }

    /** @param array<string, mixed> $user */
    public function create(Request $request, array $user): void
    {
        $this->guard(fn (): array => $this->tokens->create($user, $request->body, $request->ip()), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function revoke(Request $request, array $user, array $params): void
    {
        $this->guard(fn (): array => $this->tokens->revoke($user, (int) $params['id'], $request->ip()));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function delete(Request $request, array $user, array $params): void
    {
        $this->guard(fn (): array => $this->tokens->delete($user, (int) $params['id'], $request->ip()));
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
