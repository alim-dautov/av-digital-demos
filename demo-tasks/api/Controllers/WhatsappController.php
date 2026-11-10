<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\WazzupService;

final class WhatsappController
{
    public function __construct(private readonly WazzupService $wazzup = new WazzupService())
    {
    }

    /** @param array<string, mixed> $user */
    public function iframe(Request $request, array $user): void
    {
        unset($request);
        try {
            Response::json($this->wazzup->iframe($user));
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }

    /** @param array<string, mixed> $user */
    public function channels(Request $request, array $user): void
    {
        unset($request, $user);
        try {
            Response::json(['items' => $this->wazzup->channels()]);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }
}
