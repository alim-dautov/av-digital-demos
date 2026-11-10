<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\GrokSettingsService;

final class GrokSettingsController
{
    public function __construct(
        private readonly GrokSettingsService $settings = new GrokSettingsService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function show(Request $request, array $user): void
    {
        $this->guard(fn (): array => $this->settings->publicSettings($user));
    }

    /** @param array<string, mixed> $user */
    public function save(Request $request, array $user): void
    {
        $this->guard(fn (): array => $this->settings->save($user, $request->body));
    }

    /** @param array<string, mixed> $user */
    public function test(Request $request, array $user): void
    {
        $this->guard(fn (): array => $this->settings->test($user, $request->body));
    }

    private function guard(callable $fn): void
    {
        try {
            Response::json($fn());
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }
}
