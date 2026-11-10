<?php

declare(strict_types=1);

namespace Trx\Mcp;

use Trx\Auth\ApiTokenService;
use Trx\Database;
use Trx\Http\Request;

/**
 * Stateless MCP Streamable HTTP endpoint.
 * JSON-RPC responses are application/json. Notifications get HTTP 202 and an empty body.
 * GET is not an SSE stream.
 */
final class McpServer
{
    /** @var list<string> */
    private const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

    public function __construct(
        private readonly McpTools $tools = new McpTools(),
        private readonly ApiTokenService $tokens = new ApiTokenService(),
        private readonly int $ratePerMinute = 60,
    ) {
    }

    /**
     * @return array{status: int, body: ?string, headers: array<string, string>}
     */
    public function respond(Request $request): array
    {
        if ($request->method !== 'POST') {
            return $this->http(405, $this->rpcError(null, -32600, 'Метод не поддерживается'), [
                'Allow' => 'POST',
                'Content-Type' => 'application/json; charset=utf-8',
            ]);
        }

        $bearer = $this->tokens->bearerToken($request);
        if ($bearer === null || $bearer === '') {
            return $this->http(401, $this->rpcError(null, -32001, 'Требуется токен API'), $this->jsonHeaders());
        }
        $auth = $this->tokens->authenticate($bearer, $request->ip());
        if ($auth['user'] === null) {
            $headers = $this->jsonHeaders();
            if ($auth['retry_after'] > 0) {
                $headers['Retry-After'] = (string) $auth['retry_after'];
            }

            return $this->http($auth['status'], $this->rpcError(null, $auth['status'] === 429 ? -32029 : -32001, $auth['error']), $headers);
        }

        if (($auth['scope'] ?? 'full') !== 'full') {
            return $this->http(403, $this->rpcError(null, -32003, 'Токен с ограниченным доступом не работает в MCP'), $this->jsonHeaders());
        }

        $tokenId = (int) ($auth['token_id'] ?? 0);
        if (!$this->allowRate($tokenId)) {
            return $this->http(429, $this->rpcError(null, -32029, 'Слишком много запросов к MCP. Попробуйте через минуту.'), [
                'Content-Type' => 'application/json; charset=utf-8',
                'Retry-After' => '60',
            ]);
        }

        $parsed = $this->parse($request->rawBody);
        if ($parsed['error'] !== null) {
            return $this->http(400, $parsed['error'], $this->jsonHeaders());
        }
        $message = $parsed['message'];
        $isNotification = !array_key_exists('id', $message);
        if ($isNotification) {
            return ['status' => 202, 'body' => null, 'headers' => []];
        }

        $started = hrtime(true);
        $id = $message['id'];
        $method = (string) $message['method'];
        $params = is_array($message['params'] ?? null) ? $message['params'] : [];
        $toolName = $method;
        $ok = false;
        try {
            if ($method === 'tools/call') {
                $toolName = is_string($params['name'] ?? null) ? $params['name'] : 'tools/call';
            }
            $result = $method === 'ping' ? new \stdClass() : $this->dispatch($method, $params, $auth['user']);
            $ok = $method !== 'tools/call' || (is_array($result) && empty($result['isError']));
            $body = ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
            $status = 200;
        } catch (McpProtocolException $e) {
            $body = $this->rpcError($id, $e->rpcCode, $e->getMessage());
            $status = 200;
            $ok = false;
        } catch (\Throwable $e) {
            error_log('DEMO mcp: ' . $e->getMessage());
            $body = $this->rpcError($id, -32603, 'Внутренняя ошибка сервера');
            $status = 200;
            $ok = false;
        }
        if ($method === 'tools/call') {
            $this->log($tokenId, (int) $auth['user']['user_id'], $toolName, $ok, (int) ((hrtime(true) - $started) / 1_000_000));
        }

        return $this->encode($status, $body, $request);
    }

    /**
     * @param array<string, mixed> $params
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function dispatch(string $method, array $params, array $user): array
    {
        return match ($method) {
            'initialize' => $this->initialize($params),
            'tools/list' => ['tools' => $this->tools->definitions()],
            'tools/call' => $this->callTool($params, $user),
            default => throw new McpProtocolException('Метод не найден', -32601),
        };
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function initialize(array $params): array
    {
        $requested = $params['protocolVersion'] ?? null;

        return [
            'protocolVersion' => $this->negotiate(is_string($requested) ? $requested : null),
            'capabilities' => [
                'tools' => ['listChanged' => false],
            ],
            'serverInfo' => [
                'name' => 'Demo CRM',
                'version' => '1.0.0',
            ],
            'instructions' => 'CRM Demo. Время задач, встреч и кассы — Asia/Almaty (UTC+5). Суммы в тенге. Удаление только по точному числовому id. Инструмент видит то же, что сотрудник, к которому привязан токен.',
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function callTool(array $params, array $user): array
    {
        $name = $params['name'] ?? null;
        if (!is_string($name) || $name === '') {
            throw new McpProtocolException('Укажите имя инструмента', -32602);
        }
        if (array_key_exists('arguments', $params) && $params['arguments'] !== null && !is_array($params['arguments'])) {
            throw new McpProtocolException('arguments должен быть объектом', -32602);
        }
        $arguments = is_array($params['arguments'] ?? null) ? $params['arguments'] : [];
        if ($arguments !== [] && array_is_list($arguments)) {
            throw new McpProtocolException('arguments должен быть объектом', -32602);
        }

        return $this->tools->call($user, $name, $arguments);
    }

    private function negotiate(?string $requested): string
    {
        if ($requested !== null && in_array($requested, self::VERSIONS, true)) {
            return $requested;
        }

        return '2025-06-18';
    }

    /**
     * @return array{message: array<string, mixed>, error: ?array<string, mixed>}
     */
    private function parse(?string $raw): array
    {
        if ($raw === null || trim($raw) === '') {
            return ['message' => [], 'error' => $this->rpcError(null, -32600, 'Пустой запрос')];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || array_is_list($decoded)) {
            return ['message' => [], 'error' => $this->rpcError(null, -32700, 'Некорректный JSON-RPC')];
        }
        $method = $decoded['method'] ?? null;
        if (!is_string($method) || $method === '') {
            return ['message' => [], 'error' => $this->rpcError($decoded['id'] ?? null, -32600, 'Некорректный JSON-RPC')];
        }
        if (($decoded['jsonrpc'] ?? null) !== '2.0') {
            return ['message' => [], 'error' => $this->rpcError($decoded['id'] ?? null, -32600, 'Нужен jsonrpc 2.0')];
        }

        return ['message' => $decoded, 'error' => null];
    }

    /** @param array<string, mixed> $body */
    private function encode(int $status, array $body, Request $request): array
    {
        $headers = $this->acceptHeaders($request);
        $encoded = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            $encoded = '{}';
        }
        if (str_starts_with($headers['Content-Type'], 'text/event-stream')) {
            $encoded = "event: message\ndata: " . $encoded . "\n\n";
        }

        return ['status' => $status, 'body' => $encoded, 'headers' => $headers];
    }

    /** @param array<string, string> $headers @param array<string, mixed> $body */
    private function http(int $status, array $body, array $headers): array
    {
        $encoded = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return [
            'status' => $status,
            'body' => $encoded === false ? '{}' : $encoded,
            'headers' => $headers,
        ];
    }

    /** @return array<string, string> */
    private function jsonHeaders(): array
    {
        return ['Content-Type' => 'application/json; charset=utf-8'];
    }

    /** @return array<string, string> */
    private function acceptHeaders(Request $request): array
    {
        $accept = (string) $request->header('accept', '');
        if ($accept !== '' && !str_contains($accept, 'application/json') && !str_contains($accept, '*/*') && str_contains($accept, 'text/event-stream')) {
            return ['Content-Type' => 'text/event-stream; charset=utf-8'];
        }

        return $this->jsonHeaders();
    }

    /** @return array<string, mixed> */
    private function rpcError(mixed $id, int $code, string $message): array
    {
        return [
            'jsonrpc' => '2.0',
            'id' => $id,
            'error' => ['code' => $code, 'message' => $message],
        ];
    }

    private function allowRate(int $tokenId): bool
    {
        if ($tokenId <= 0) {
            return false;
        }
        $pdo = Database::pdo();
        $bucket = 'mcp:' . $tokenId;
        $pdo->prepare(
            'INSERT INTO api_rate_limits (bucket, hits, reset_at)
             VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 60 SECOND))
             ON DUPLICATE KEY UPDATE
                hits = IF(reset_at <= NOW(), 1, hits + 1),
                reset_at = IF(reset_at <= NOW(), DATE_ADD(NOW(), INTERVAL 60 SECOND), reset_at)'
        )->execute([$bucket]);
        $stmt = $pdo->prepare('SELECT hits FROM api_rate_limits WHERE bucket = ?');
        $stmt->execute([$bucket]);

        return (int) $stmt->fetchColumn() <= $this->ratePerMinute;
    }

    private function log(int $tokenId, int $userId, string $tool, bool $ok, int $durationMs): void
    {
        $tool = substr(preg_replace('/[^a-z0-9_]/', '', strtolower($tool)) ?? 'tool', 0, 64);
        if ($tool === '') {
            $tool = 'tool';
        }
        Database::pdo()->prepare(
            'INSERT INTO mcp_call_log (token_id, user_id, tool_name, ok, duration_ms) VALUES (?, ?, ?, ?, ?)'
        )->execute([$tokenId, $userId, $tool, $ok ? 1 : 0, max(0, $durationMs)]);
    }
}

final class McpProtocolException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $rpcCode)
    {
        parent::__construct($message);
    }
}
