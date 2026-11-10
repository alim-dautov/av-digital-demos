<?php

declare(strict_types=1);

namespace Trx\Security;

use Trx\Config;
use Trx\Services\AppException;

/**
 * Encrypts the Grok webhook secret. The key itself never comes from the browser:
 * env DEMO_WEBHOOK_KEY, then config grok.encryption_key, then storage/grok.key.
 * If none of those exist and the storage directory is writable, a key file is created.
 */
final class SecretBox
{
    public const HINT = 'Ключ шифрования вебхука не найден. Задайте grok.encryption_key в config.php (файл лежит вне сайта) или переменную окружения DEMO_WEBHOOK_KEY. Если каталог storage доступен для записи, CRM сама создаст файл storage/grok.key.';

    private string $source = 'missing';

    /**
     * @param string|null $materialOverride null reads env, config, then the key file. An empty string forces "no key".
     */
    public function __construct(
        private readonly ?string $materialOverride = null,
        private readonly ?string $keyFile = null,
        private readonly bool $allowGenerate = true,
    ) {
    }

    /** @return array{ready: bool, source: string, hint: ?string} */
    public function status(): array
    {
        $ready = $this->material() !== null;

        return [
            'ready' => $ready,
            'source' => $this->source,
            'hint' => $ready ? null : self::HINT,
        ];
    }

    public function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', $this->keyBytes(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false || strlen($tag) !== 16) {
            throw new AppException('Не удалось зашифровать ключ вебхука', 500);
        }

        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    public function decrypt(string $stored): string
    {
        if (!str_starts_with($stored, 'v1:')) {
            throw new AppException('Сохранённый ключ вебхука повреждён. Задайте его заново.', 500);
        }
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) < 29) {
            throw new AppException('Сохранённый ключ вебхука повреждён. Задайте его заново.', 500);
        }
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', $this->keyBytes(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($plain === false) {
            throw new AppException('Не удалось прочитать ключ вебхука. Проверьте ключ шифрования на сервере.', 500);
        }

        return $plain;
    }

    private function keyBytes(): string
    {
        $material = $this->material();
        if ($material === null) {
            throw new AppException(self::HINT, 503);
        }

        return hash('sha256', $material, true);
    }

    private function material(): ?string
    {
        if ($this->materialOverride !== null) {
            $value = trim($this->materialOverride);
            $this->source = $value === '' ? 'missing' : 'config';

            return $value === '' ? null : $value;
        }

        $env = getenv('DEMO_WEBHOOK_KEY');
        if (is_string($env) && trim($env) !== '') {
            $this->source = 'env';

            return trim($env);
        }

        $configured = Config::get('grok.encryption_key', '');
        if (is_string($configured) && trim($configured) !== '') {
            $this->source = 'config';

            return trim($configured);
        }

        $fromFile = $this->readOrCreateFile();
        if ($fromFile !== null) {
            $this->source = 'file';

            return $fromFile;
        }

        $this->source = 'missing';

        return null;
    }

    private function readOrCreateFile(): ?string
    {
        $path = $this->keyFile ?? $this->defaultPath();
        $dir = dirname($path);
        if (!is_dir($dir) && !$this->allowGenerate) {
            return null;
        }
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            return null;
        }

        $handle = @fopen($path, 'c+');
        if ($handle === false) {
            return null;
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                return null;
            }
            $existing = stream_get_contents($handle);
            if (is_string($existing) && trim($existing) !== '') {
                return trim($existing);
            }
            if (!$this->allowGenerate) {
                return null;
            }
            $hex = bin2hex(random_bytes(32));
            ftruncate($handle, 0);
            rewind($handle);
            if (fwrite($handle, $hex) === false) {
                return null;
            }
            fflush($handle);
            @chmod($path, 0600);

            return $hex;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function defaultPath(): string
    {
        $storage = Config::get('paths.storage');
        if (!is_string($storage) || $storage === '') {
            $storage = dirname(__DIR__, 2) . '/storage';
        }

        return rtrim($storage, '/') . '/grok.key';
    }
}
