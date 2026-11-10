<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\MiniChatService;

final class MiniChatController
{
    public function __construct(
        private readonly MiniChatService $chat = new MiniChatService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function index(Request $request, array $user): void
    {
        $after = (int) ($request->query['after_id'] ?? 0);
        Response::json(['items' => $this->chat->list($user, $after)]);
    }

    /** @param array<string, mixed> $user */
    public function store(Request $request, array $user): void
    {
        try {
            $message = $this->chat->accept($user, (string) $request->input('text', ''));
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);

            return;
        }

        $payload = json_encode(['message' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            Response::error('Не удалось сохранить сообщение', 500);

            return;
        }
        http_response_code(201);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . strlen($payload));
        echo $payload;
        $this->finish();
        try {
            $this->chat->dispatch((int) $message['id']);
        } catch (\Throwable $e) {
            error_log('DEMO mini-chat webhook: ' . $e->getMessage());
        }
    }

    private function finish(): void
    {
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();

            return;
        }
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        flush();
    }
}
