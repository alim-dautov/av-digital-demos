<?php

declare(strict_types=1);

namespace Trx;

final class Config
{
    /** @var array<string, mixed>|null */
    private static ?array $data = null;

    /** @return array<string, mixed> */
    public static function all(): array
    {
        if (self::$data === null) {
            $path = dirname(__DIR__) . '/config.php';
            if (!is_file($path)) {
                throw new \RuntimeException('config.php missing. Copy config.example.php');
            }
            /** @var array<string, mixed> $cfg */
            $cfg = require $path;
            self::$data = $cfg;
        }

        return self::$data;
    }

    public static function get(string $path, mixed $default = null): mixed
    {
        $parts = explode('.', $path);
        $node = self::all();
        foreach ($parts as $part) {
            if (!is_array($node) || !array_key_exists($part, $node)) {
                return $default;
            }
            $node = $node[$part];
        }

        return $node;
    }
}
