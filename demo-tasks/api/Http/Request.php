<?php

declare(strict_types=1);

namespace Trx\Http;

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        /** @var array<string, string> */
        public readonly array $query,
        /** @var array<string, mixed> */
        public readonly array $body,
        /** @var array<string, string> */
        public readonly array $headers,
        public readonly ?string $rawBody,
    ) {
    }

    public static function fromGlobals(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $path = preg_replace('#^/api#', '', $path) ?: '/';

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_') && is_string($value)) {
                $name = str_replace('_', '-', strtolower(substr($key, 5)));
                $headers[$name] = $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE']) && is_string($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = $_SERVER['CONTENT_TYPE'];
        }
        if (!isset($headers['authorization'])) {
            $authorization = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? null;
            if (is_string($authorization) && $authorization !== '') {
                $headers['authorization'] = $authorization;
            } elseif (function_exists('getallheaders')) {
                $all = getallheaders();
                if (is_array($all)) {
                    foreach ($all as $name => $value) {
                        if (is_string($name) && strcasecmp($name, 'Authorization') === 0 && is_string($value) && $value !== '') {
                            $headers['authorization'] = $value;
                            break;
                        }
                    }
                }
            }
        }

        $raw = file_get_contents('php://input') ?: null;
        $body = [];
        $ct = $headers['content-type'] ?? '';
        if ($raw !== null && str_contains($ct, 'application/json')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        } elseif ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
            $body = $_POST;
        }

        /** @var array<string, string> $query */
        $query = [];
        foreach ($_GET as $k => $v) {
            if (is_string($k) && is_string($v)) {
                $query[$k] = $v;
            }
        }

        return new self($method, $path, $query, $body, $headers, $raw);
    }

    public function header(string $name, ?string $default = null): ?string
    {
        $key = strtolower($name);

        return $this->headers[$key] ?? $default;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function ip(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    public function userAgent(): string
    {
        return substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    }
}
