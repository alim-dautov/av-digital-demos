<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Auth\AuthService;
use Trx\Auth\SessionService;
use Trx\Http\Request;
use Trx\Http\Response;

final class AuthController
{
    public function __construct(
        private readonly AuthService $auth = new AuthService(),
        private readonly SessionService $sessions = new SessionService(),
    ) {
    }

    public function login(Request $request): void
    {
        $login = (string) ($request->input('login') ?? $request->input('email', ''));
        $password = (string) $request->input('password', '');
        $totp = $request->input('totp_code');
        $totpCode = is_string($totp) ? $totp : null;

        $result = $this->auth->login($login, $password, $totpCode, $request->ip(), $request->userAgent());
        if (!$result['ok']) {
            $status = !empty($result['needs_totp']) ? 401 : 401;
            Response::json([
                'error' => $result['error'] ?? 'Ошибка входа',
                'needs_totp' => $result['needs_totp'] ?? false,
            ], $status);

            return;
        }

        Response::json([
            'user' => $result['user'],
            'csrf_token' => $result['csrf_token'],
        ]);
    }

    public function logout(Request $request): void
    {
        $session = $this->sessions->resolve($this->sessions->readCookie());
        $this->auth->logout(
            $this->sessions->readCookie(),
            $session ? (int) $session['user_id'] : null,
            $request->ip()
        );
        Response::json(['ok' => true]);
    }
}
