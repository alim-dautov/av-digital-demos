<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Config;

/**
 * Wazzup (wazzup24.com) API v3. The key stays on the server:
 * config.php 'wazzup' => ['api_key' => ...] or env WAZZUP_API_KEY.
 */
final class WazzupService
{
    private const BASE = 'https://api.wazzup24.com/v3';

    /** @var null|callable(string,string,?array):array{int,mixed} */
    private $transport;

    public function __construct(?callable $transport = null)
    {
        $this->transport = $transport;
    }

    public static function apiKey(): string
    {
        $key = (string) Config::get('wazzup.api_key', '');
        if ($key === '') {
            $key = (string) (getenv('WAZZUP_API_KEY') ?: '');
        }

        return trim($key);
    }

    public function configured(): bool
    {
        return self::apiKey() !== '';
    }

    /**
     * Sync the CRM user into Wazzup and return a chat window URL for them.
     *
     * @param array<string, mixed> $user
     * @return array{url:string}
     */
    public function iframe(array $user): array
    {
        $wazzupUser = [
            'id' => 'demo-' . (int) ($user['user_id'] ?? 0),
            'name' => mb_substr(trim((string) ($user['name'] ?? '')) ?: 'CRM user', 0, 150),
        ];
        [$status] = $this->call('POST', '/users', [$wazzupUser]);
        if ($status >= 300) {
            throw new AppException('Wazzup не принял пользователя (HTTP ' . $status . ')', 502);
        }
        [$status, $body] = $this->call('POST', '/iframe', ['user' => $wazzupUser, 'scope' => 'global']);
        $url = is_array($body) ? (string) ($body['url'] ?? '') : '';
        if ($status >= 300 || !str_starts_with($url, 'https://')) {
            throw new AppException('Wazzup не выдал окно чатов (HTTP ' . $status . ')', 502);
        }

        return ['url' => $url];
    }

    /** @return list<array{transport:string,state:string,name:string}> */
    public function channels(): array
    {
        [$status, $body] = $this->call('GET', '/channels', null);
        if ($status >= 300 || !is_array($body)) {
            throw new AppException('Wazzup: список каналов недоступен (HTTP ' . $status . ')', 502);
        }
        $out = [];
        foreach ($body as $ch) {
            if (is_array($ch)) {
                $out[] = [
                    'transport' => (string) ($ch['transport'] ?? ''),
                    'state' => (string) ($ch['state'] ?? ''),
                    'name' => (string) ($ch['name'] ?? $ch['plainId'] ?? ''),
                ];
            }
        }

        return $out;
    }

    /**
     * @param array<mixed>|null $payload
     * @return array{0:int,1:mixed}
     */
    private function call(string $method, string $path, ?array $payload): array
    {
        if ($this->transport !== null) {
            return ($this->transport)($method, $path, $payload);
        }
        if (\Trx\Config::get('app.demo_mode', false)) {
            throw new AppException('В демо-версии интеграции отключены', 503);
        }
        $key = self::apiKey();
        if ($key === '') {
            throw new AppException('Wazzup не настроен: нет API-ключа на сервере', 503);
        }
        $ch = curl_init(self::BASE . $path);
        $headers = ['Authorization: Bearer ' . $key, 'Accept: application/json'];
        $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CUSTOMREQUEST => $method];
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
            $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false) {
            throw new AppException('Wazzup недоступен', 502);
        }

        return [$status, json_decode((string) $raw, true)];
    }
}
