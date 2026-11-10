<?php

declare(strict_types=1);

namespace Trx\Services;

/**
 * Limits for one task file. Shared hosting may cap uploads below the product maximum.
 */
final class AttachmentRules
{
    public const MAX_BYTES = 10 * 1024 * 1024;

    public const EMPTY_FILE = 'Файл пустой';

    public const MISSING = 'Файл не получен';

    /**
     * @param array{name?:string,type?:string,tmp_name?:string,error?:int,size?:int}|null $file
     */
    public static function rejection(?array $file, int $contentLength = 0): ?string
    {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            return self::tooBig();
        }
        if ($file === null || $error !== UPLOAD_ERR_OK) {
            if ($contentLength > self::effectiveMaxBytes()) {
                return self::tooBig();
            }

            return self::MISSING;
        }
        $size = (int) ($file['size'] ?? 0);
        if ($size > self::effectiveMaxBytes()) {
            return self::tooBig();
        }
        if ($size <= 0) {
            return self::EMPTY_FILE;
        }
        if (!is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
            return self::MISSING;
        }

        return null;
    }

    /**
     * Product cap, or the hosting cap when it is lower.
     */
    public static function effectiveMaxBytes(): int
    {
        $limits = [self::MAX_BYTES];
        $upload = self::iniBytes((string) ini_get('upload_max_filesize'));
        $post = self::iniBytes((string) ini_get('post_max_size'));
        if ($upload > 0) {
            $limits[] = $upload;
        }
        // Multipart framing needs a little room above the file itself.
        if ($post > 0) {
            $limits[] = max(1, $post - 64 * 1024);
        }

        return min($limits);
    }

    public static function tooBig(): string
    {
        $mb = self::effectiveMaxBytes() / 1048576;
        if ($mb >= 1 && abs($mb - round($mb)) < 0.05) {
            $label = (string) (int) round($mb);
        } elseif ($mb >= 1) {
            $label = str_replace('.', ',', number_format($mb, 1, '.', ''));
        } else {
            $label = (string) max(1, (int) round(self::effectiveMaxBytes() / 1024)) . ' КБ';

            return "Файл слишком большой. Максимум — {$label}";
        }

        return "Файл слишком большой. Максимум — {$label} МБ";
    }

    private static function iniBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '' || !preg_match('/^(\d+(?:\.\d+)?)\s*([kmg])?$/i', $value, $match)) {
            return 0;
        }
        $number = (float) $match[1];
        $unit = strtolower($match[2] ?? '');

        return (int) match ($unit) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
