<?php

declare(strict_types=1);

/**
 * Fill a missing v2 icon by resampling the 512 master onto an opaque black field.
 * Does not replace artwork that is already in the tree.
 * The wordmark itself comes from scripts/generate-pwa-icons.py.
 */
$dirs = [
    dirname(__DIR__) . '/frontend/public',
    dirname(__DIR__) . '/public_html',
];

function resample_opaque(string $src, string $dest, int $size): void
{
    if (is_file($dest) && filesize($dest) > 200) {
        echo "keep $dest\n";
        return;
    }
    if (!is_file($src)) {
        fwrite(STDERR, "missing source $src\n");
        return;
    }
    if (!function_exists('imagecreatefrompng')) {
        copy($src, $dest);
        echo "copied $dest\n";
        return;
    }
    $im = imagecreatefrompng($src);
    if ($im === false) {
        fwrite(STDERR, "cannot read $src\n");
        return;
    }
    $out = imagecreatetruecolor($size, $size);
    $bg = imagecolorallocate($out, 0x0B, 0x0B, 0x0D);
    imagefilledrectangle($out, 0, 0, $size, $size, $bg);
    imagecopyresampled($out, $im, 0, 0, 0, 0, $size, $size, imagesx($im), imagesy($im));
    imagepng($out, $dest);
    imagedestroy($im);
    imagedestroy($out);
    echo "wrote $dest\n";
}

foreach ($dirs as $dir) {
    $icons = $dir . '/pwa-icons';
    if (!is_dir($icons)) {
        mkdir($icons, 0775, true);
    }
    $master = $icons . '/icon-512-v2.png';
    resample_opaque($master, $icons . '/icon-192-v2.png', 192);
    resample_opaque($master, $icons . '/icon-512-v2.png', 512);
    resample_opaque($master, $icons . '/icon-192-maskable-v2.png', 192);
    resample_opaque($master, $icons . '/icon-512-maskable-v2.png', 512);
    resample_opaque($master, $dir . '/apple-touch-icon-v2.png', 180);
}

echo "icons ok\n";
