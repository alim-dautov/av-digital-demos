<?php

declare(strict_types=1);

namespace Trx\Services;

use Dompdf\Dompdf;
use Dompdf\Options;
use Trx\Config;
use Trx\Security\Policy;

/**
 * Renders a КП to PDF with dompdf (DejaVu Sans → Cyrillic) and keeps it under storage/kp,
 * outside the webroot. Files are served only through GET /api/kp/{id}/pdf.
 */
final class KpPdfService
{
    public const COMPANY_KEY = 'kp_company';
    public const TEMPLATE = __DIR__ . '/../Views/kp_offer.php';

    public function __construct(private readonly SettingsService $settings = new SettingsService())
    {
    }

    public static function dir(): string
    {
        return rtrim((string) Config::get('paths.storage', dirname(__DIR__, 2) . '/storage'), '/') . '/kp';
    }

    /** @return array{name: string, details: string, phone: string, email: string, site: string} */
    public function company(): array
    {
        $raw = $this->settings->get(self::COMPANY_KEY);
        $raw = is_array($raw) ? $raw : [];
        $out = [];
        foreach (['name' => 'DEMO', 'details' => '', 'phone' => '', 'email' => '', 'site' => ''] as $k => $default) {
            $v = $raw[$k] ?? null;
            $out[$k] = is_string($v) && trim($v) !== '' ? trim($v) : $default;
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $actor
     * @param array<string, mixed> $input
     * @return array{name: string, details: string, phone: string, email: string, site: string}
     */
    public function saveCompany(array $actor, array $input): array
    {
        if (!Policy::isOwner($actor)) {
            throw new AppException('Недостаточно прав', 403);
        }
        $limits = ['name' => 255, 'details' => 2000, 'phone' => 64, 'email' => 190, 'site' => 255];
        $out = [];
        foreach ($limits as $k => $max) {
            $v = $input[$k] ?? '';
            if (!is_string($v) || mb_strlen($v) > $max) {
                throw new AppException("Поле {$k}: текст до {$max} символов", 422);
            }
            $out[$k] = trim($v);
        }
        $this->settings->set(self::COMPANY_KEY, $out);

        return $this->company();
    }

    /** @param array<string, mixed> $kp view data (see template header) @param array<string, string> $author */
    public function html(array $kp, array $author): string
    {
        $company = $this->company();
        $e = static fn (mixed $s): string => htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $money = static fn (float $v): string => number_format($v, fmod($v, 1.0) === 0.0 ? 0 : 2, ',', ' ') . ' ₸';
        ob_start();
        try {
            (static function () use ($kp, $company, $author, $e, $money): void {
                require KpPdfService::TEMPLATE;
            })();
        } finally {
            $html = (string) ob_get_clean();
        }

        return $html;
    }

    public function render(string $html): string
    {
        $cache = rtrim((string) Config::get('paths.storage', dirname(__DIR__, 2) . '/storage'), '/') . '/cache/dompdf';
        if (!is_dir($cache)) {
            @mkdir($cache, 0775, true);
        }
        $options = new Options();
        $options->setDefaultFont('DejaVu Sans');
        $options->setIsRemoteEnabled(false);
        $options->setIsPhpEnabled(false);
        $options->setChroot([dirname(__DIR__)]);
        if (is_dir($cache) && is_writable($cache)) {
            $options->setFontCache($cache);
            $options->setTempDir($cache);
        }
        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4');
        $dompdf->render();

        return (string) $dompdf->output();
    }

    /** Writes the PDF atomically and returns the file name relative to storage/kp. */
    public function store(int $id, string $pdf): string
    {
        $dir = self::dir();
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new AppException('Не удалось создать папку для PDF', 500);
        }
        $name = sprintf('kp-%06d.pdf', $id);
        $tmp = $dir . '/.' . $name . '.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $pdf) === false || !rename($tmp, $dir . '/' . $name)) {
            @unlink($tmp);
            throw new AppException('Не удалось сохранить PDF', 500);
        }

        return $name;
    }

    public static function path(string $name): ?string
    {
        if (!preg_match('/^kp-\d{6}\.pdf$/', $name)) {
            return null;
        }
        $path = self::dir() . '/' . $name;

        return is_file($path) ? $path : null;
    }
}
