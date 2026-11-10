<?php

declare(strict_types=1);

namespace Trx\Http;

use Trx\Auth\ApiTokenService;
use Trx\Auth\SessionService;

/**
 * Cookie session, or Authorization: Bearer when the caller is an external assistant.
 * A bearer request is the bound user and does not use the CSRF cookie.
 * An invalid bearer token is rejected and is not replaced by a browser session.
 */
final class AuthGate
{
    public function __construct(
        private readonly SessionService $sessions = new SessionService(),
        private readonly ApiTokenService $tokens = new ApiTokenService(),
    ) {
    }

    /**
     * @return array{ok: true, user: array<string, mixed>, bearer: bool}|array{ok: false, status: int, error: string, retry_after: int}
     */
    public function decide(Request $request, bool $csrf): array
    {
        $bearer = $this->tokens->bearerToken($request);
        if ($bearer !== null) {
            $auth = $this->tokens->authenticate($bearer, $request->ip());
            if ($auth['user'] === null) {
                return $this->fail($auth['status'], $auth['error'], $auth['retry_after']);
            }

            return ['ok' => true, 'user' => $auth['user'], 'bearer' => true];
        }

        $session = $this->sessions->resolve($this->sessions->readCookie());
        if (!$session) {
            return $this->fail(401, 'Требуется вход');
        }
        if ($csrf) {
            $token = $request->header('x-csrf-token') ?? $request->input('_csrf', '');
            if (!is_string($token) || !hash_equals((string) $session['csrf_token'], $token)) {
                return $this->fail(419, 'Недействительный CSRF-токен');
            }
        }

        return ['ok' => true, 'user' => $session, 'bearer' => false];
    }

    /**
     * @return array{ok: false, status: int, error: string, retry_after: int}
     */
    private function fail(int $status, string $error, int $retryAfter = 0): array
    {
        return ['ok' => false, 'status' => $status, 'error' => $error, 'retry_after' => $retryAfter];
    }
}
