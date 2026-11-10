<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Config;
use Trx\Security\SecretBox;

final class GrokSettingsService
{
    private const URL_KEY = 'grok_webhook_url';

    private const SECRET_KEY = 'grok_webhook_key';

    private const AUTH_KEY = 'grok_webhook_auth';

    public function __construct(
        private readonly SettingsService $settings = new SettingsService(),
        private readonly SecretBox $secrets = new SecretBox(),
        private readonly WebhookDispatcher $webhooks = new WebhookDispatcher(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /**
     * @param array<string, mixed> $actor
     * @return array<string, mixed>
     */
    public function publicSettings(array $actor): array
    {
        $this->assertOwner($actor);
        $box = $this->secrets->status();
        $url = $this->storedUrl();

        return [
            'webhook_url' => $url,
            'webhook_key_set' => $this->hasKey(),
            'webhook_auth' => $this->authMode(),
            'mcp_url' => self::mcpUrl(),
            'encryption_ready' => $box['ready'],
            'encryption_source' => $box['source'],
            'encryption_hint' => $box['hint'],
        ];
    }

    /**
     * @param array<string, mixed> $actor
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function save(array $actor, array $input): array
    {
        $this->assertOwner($actor);
        if (array_key_exists('webhook_url', $input)) {
            $this->settings->set(self::URL_KEY, WebhookDispatcher::validateUrl((string) $input['webhook_url']));
        }
        if (array_key_exists('webhook_auth', $input)) {
            $mode = (string) $input['webhook_auth'];
            if (!in_array($mode, ['raw', 'bearer'], true)) {
                throw new AppException('Выберите формат заголовка: ключ как есть или Bearer', 422);
            }
            $this->settings->set(self::AUTH_KEY, $mode);
        }
        $keyChanged = false;
        if (!empty($input['clear_webhook_key'])) {
            $this->settings->forget(self::SECRET_KEY);
            $keyChanged = true;
        } elseif (array_key_exists('webhook_key', $input) && trim((string) $input['webhook_key']) !== '') {
            $key = trim((string) $input['webhook_key']);
            if (strlen($key) > 500 || str_contains($key, "\r") || str_contains($key, "\n")) {
                throw new AppException('Ключ вебхука не длиннее 500 символов и без перевода строки', 422);
            }
            if (!$this->secrets->status()['ready']) {
                throw new AppException(SecretBox::HINT, 503);
            }
            $this->settings->set(self::SECRET_KEY, $this->secrets->encrypt($key));
            $keyChanged = true;
        }
        $this->audit->log((int) $actor['user_id'], 'grok_settings', 'webhook', 'update', null, [
            'url_host' => $this->host($this->storedUrl()),
            'auth' => $this->authMode(),
            'key_changed' => $keyChanged,
        ]);

        return $this->publicSettings($actor);
    }

    /**
     * Sends a connectivity check. A key typed in the form is used for this call only and is not stored.
     *
     * @param array<string, mixed> $actor
     * @param array<string, mixed> $input
     * @return array{ok: bool, http_status: int, error: string}
     */
    public function test(array $actor, array $input): array
    {
        $this->assertOwner($actor);
        $url = trim((string) ($input['webhook_url'] ?? ''));
        if ($url === '') {
            $url = $this->storedUrl();
        }
        $url = WebhookDispatcher::validateUrl($url);
        if ($url === '') {
            throw new AppException('Укажите адрес вебхука', 422);
        }
        $mode = (string) ($input['webhook_auth'] ?? $this->authMode());
        if (!in_array($mode, ['raw', 'bearer'], true)) {
            throw new AppException('Выберите формат заголовка: ключ как есть или Bearer', 422);
        }
        $typed = trim((string) ($input['webhook_key'] ?? ''));
        $key = $typed !== '' ? $typed : $this->storedKey();
        $result = $this->webhooks->send($url, $key, $mode, [
            'text' => 'Проверка связи',
            'userId' => (int) $actor['user_id'],
            'userName' => (string) ($actor['name'] ?? ''),
            'commandId' => $this->uuid(),
        ]);

        return [
            'ok' => $result['ok'],
            'http_status' => $result['http_status'],
            'error' => $result['error'],
        ];
    }

    /** @return array{url: string, key: string, auth: string} */
    public function dispatchConfig(): array
    {
        return [
            'url' => $this->storedUrl(),
            'key' => $this->storedKey(),
            'auth' => $this->authMode(),
        ];
    }

    public static function mcpUrl(): string
    {
        $base = Config::get('grok.public_url', 'https://demo.example');
        if (!is_string($base) || trim($base) === '') {
            $base = 'https://demo.example';
        }

        return rtrim($base, '/') . '/api/mcp';
    }

    /** @param array<string, mixed> $actor */
    private function assertOwner(array $actor): void
    {
        if (!\Trx\Security\Policy::isRealOwner($actor)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    private function storedUrl(): string
    {
        $url = $this->settings->get(self::URL_KEY, '');

        return is_string($url) ? $url : '';
    }

    private function authMode(): string
    {
        $mode = $this->settings->get(self::AUTH_KEY, 'raw');

        return $mode === 'bearer' ? 'bearer' : 'raw';
    }

    private function hasKey(): bool
    {
        $stored = $this->settings->get(self::SECRET_KEY, '');

        return is_string($stored) && $stored !== '';
    }

    private function storedKey(): string
    {
        $stored = $this->settings->get(self::SECRET_KEY, '');
        if (!is_string($stored) || $stored === '') {
            return '';
        }

        return $this->secrets->decrypt($stored);
    }

    private function host(string $url): string
    {
        $host = parse_url($url, PHP_URL_HOST);

        return is_string($host) ? $host : '';
    }

    private function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return 'test-' . substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    }
}
