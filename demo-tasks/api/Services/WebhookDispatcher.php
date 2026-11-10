<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Config;

final class CurlWebhookTransport implements WebhookTransport
{
    public function post(string $url, array $headers, string $body, int $timeoutSeconds): array
    {
        if (\Trx\Config::get('app.demo_mode', false)) {
            return ['ok' => false, 'http_status' => 0, 'error' => 'Демо-режим: внешние запросы отключены'];
        }
        if (function_exists('curl_init')) {
            return $this->viaCurl($url, $headers, $body, $timeoutSeconds);
        }

        return $this->viaStream($url, $headers, $body, $timeoutSeconds);
    }

    /**
     * @param array<string, string> $headers
     * @return array{ok: bool, http_status: int, error: string}
     */
    private function viaCurl(string $url, array $headers, string $body, int $timeoutSeconds): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'http_status' => 0, 'error' => 'Не удалось связаться с вебхуком'];
        }
        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = $name . ': ' . $value;
        }
        $options = [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $lines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min(3, $timeoutSeconds),
            CURLOPT_FOLLOWLOCATION => false,
        ];
        if (defined('CURLPROTO_HTTP') && defined('CURLPROTO_HTTPS')) {
            $options[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
        }
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($raw === false || $errno !== 0) {
            return [
                'ok' => false,
                'http_status' => $status,
                'error' => $this->short($error !== '' ? $error : 'Не удалось связаться с вебхуком'),
            ];
        }
        $ok = $status >= 200 && $status < 300;

        return ['ok' => $ok, 'http_status' => $status, 'error' => $ok ? '' : ('HTTP ' . $status)];
    }

    /**
     * @param array<string, string> $headers
     * @return array{ok: bool, http_status: int, error: string}
     */
    private function viaStream(string $url, array $headers, string $body, int $timeoutSeconds): array
    {
        $lines = [];
        foreach ($headers as $name => $value) {
            $lines[] = $name . ': ' . $value;
        }
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $lines),
                'content' => $body,
                'timeout' => $timeoutSeconds,
                'ignore_errors' => true,
                'follow_location' => 0,
            ],
        ]);
        $raw = @file_get_contents($url, false, $context);
        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
                $status = (int) $m[1];
            }
        }
        if ($raw === false && $status === 0) {
            return ['ok' => false, 'http_status' => 0, 'error' => 'Не удалось связаться с вебхуком'];
        }
        $ok = $status >= 200 && $status < 300;

        return ['ok' => $ok, 'http_status' => $status, 'error' => $ok ? '' : ('HTTP ' . $status)];
    }

    private function short(string $error): string
    {
        $error = trim(preg_replace('/\s+/u', ' ', $error) ?? $error);

        return mb_substr($error, 0, 255);
    }
}

/**
 * POSTs the mini-chat command to the owner's webhook.
 * Authorization is either the key as stored, or "Bearer <key>", chosen in settings.
 */
final class WebhookDispatcher
{
    public const TIMEOUT_SECONDS = 5;

    public function __construct(
        private readonly WebhookTransport $transport = new CurlWebhookTransport(),
    ) {
    }

    /**
     * @param array{text: string, userId: int, userName: string, commandId: string} $payload
     * @return array{ok: bool, http_status: int, error: string}
     */
    public function send(string $url, string $key, string $authMode, array $payload): array
    {
        $body = json_encode([
            'text' => $payload['text'],
            'userId' => $payload['userId'],
            'userName' => $payload['userName'],
            'commandId' => $payload['commandId'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($body === false) {
            return ['ok' => false, 'http_status' => 0, 'error' => 'Не удалось собрать запрос'];
        }
        $headers = [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ];
        $authorization = $this->authorizationHeader($key, $authMode);
        if ($authorization !== null) {
            $headers['Authorization'] = $authorization;
        }

        return $this->transport->post($url, $headers, $body, self::TIMEOUT_SECONDS);
    }

    public function authorizationHeader(string $key, string $authMode): ?string
    {
        $key = trim($key);
        if ($key === '') {
            return null;
        }
        if (str_contains($key, "\r") || str_contains($key, "\n")) {
            throw new AppException('Ключ вебхука не должен содержать перевод строки', 422);
        }
        if ($authMode === 'bearer') {
            return 'Bearer ' . $key;
        }

        return $key;
    }

    public static function validateUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }
        if (strlen($url) > 500) {
            throw new AppException('Слишком длинный адрес вебхука', 422);
        }
        $parts = parse_url($url);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw new AppException('Некорректный адрес вебхука', 422);
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new AppException('Адрес вебхука не должен содержать логин и пароль', 422);
        }
        $scheme = strtolower((string) $parts['scheme']);
        $env = (string) Config::get('app.env', 'production');
        if ($scheme !== 'https' && !($scheme === 'http' && $env === 'local')) {
            throw new AppException('Адрес вебхука должен начинаться с https://', 422);
        }

        return $url;
    }
}
