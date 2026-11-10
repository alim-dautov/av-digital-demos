<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Config;
use Trx\Database;
use Trx\Domain\KpTotals;

/**
 * «КП» — commercial offers. Made in the CRM («Создать КП») or through /api/kp.
 * When line items are given, the total is computed here and a PDF is generated (KpPdfService).
 */
final class KpService
{
    public const STATUSES = [
        'draft' => 'черновик',
        'sent' => 'отправлено',
        'accepted' => 'принято',
        'rejected' => 'отклонено',
    ];

    public const DISCOUNT_TYPES = ['percent', 'amount'];

    public function __construct(private readonly KpPdfService $pdf = new KpPdfService())
    {
    }

    /** @param array<string, mixed> $query @return array{items: list<array<string, mixed>>, statuses: array<string,string>} */
    public function list(array $query): array
    {
        $where = [];
        $params = [];
        if (isset($query['status']) && $query['status'] !== '') {
            $where[] = 'k.status = ?';
            $params[] = $this->status($query['status']);
        }
        if (isset($query['q']) && is_string($query['q']) && trim($query['q']) !== '') {
            $where[] = '(k.client_name LIKE ? OR k.client_company LIKE ? OR k.number LIKE ?)';
            $like = '%' . trim($query['q']) . '%';
            array_push($params, $like, $like, $like);
        }
        $limit = max(1, min(500, (int) ($query['limit'] ?? 200)));
        $stmt = Database::pdo()->prepare(
            $this->select() . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY k.id DESC LIMIT ' . $limit
        );
        $stmt->execute($params);
        $items = array_map(fn (array $r): array => $this->present($r), $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);

        return ['items' => $items, 'statuses' => self::STATUSES];
    }

    /** @return array<string, mixed> */
    public function get(int $id): array
    {
        $stmt = Database::pdo()->prepare($this->select() . ' WHERE k.id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('КП не найдено', 404);
        }

        return $this->present($row);
    }

    /** @param array<string, mixed> $actor @param array<string, mixed> $input @return array<string, mixed> */
    public function create(array $actor, array $input): array
    {
        $client = $this->clientName($input['client_name'] ?? null);
        $details = $this->details($input['details'] ?? null);
        $status = array_key_exists('status', $input) && $input['status'] !== null && $input['status'] !== '' ? $this->status($input['status']) : 'draft';
        $items = $this->hasItems($input) ? KpTotals::items($input['items']) : null;
        [$discountType, $discountValue] = $this->discount($input);
        $amount = $items !== null
            ? number_format(KpTotals::total($items, $discountType, $discountValue), 2, '.', '')
            : $this->amount($input['amount'] ?? 0);
        $pdf = $items !== null ? null : $this->pdfUrl($input['pdf_url'] ?? null);
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO kp_offers (client_name, client_phone, client_company, amount, details, items_json, discount_type, discount_value,
                notes, valid_until, pdf_url, status, author_user_id, author_token_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $client,
            $this->short($input['client_phone'] ?? null, 64, 'Телефон'),
            $this->short($input['client_company'] ?? null, 255, 'Компания'),
            $amount,
            $details,
            $items !== null ? json_encode($items, JSON_UNESCAPED_UNICODE) : null,
            $discountType,
            $discountValue,
            $this->notes($input['notes'] ?? null),
            $this->date($input['valid_until'] ?? null),
            $pdf,
            $status,
            $this->authorId($actor),
            $this->tokenName($actor),
        ]);
        $id = (int) $pdo->lastInsertId();
        $pdo->prepare("UPDATE kp_offers SET number = CONCAT('КП-', LPAD(id, 4, '0')) WHERE id = ?")->execute([$id]);
        if ($items !== null) {
            $this->generatePdf($id);
        }

        return $this->get($id);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function update(int $id, array $input): array
    {
        $current = $this->get($id);
        $sets = [];
        $params = [];
        $set = static function (string $col, mixed $val) use (&$sets, &$params): void {
            $sets[] = $col . ' = ?';
            $params[] = $val;
        };
        if (array_key_exists('client_name', $input)) {
            $set('client_name', $this->clientName($input['client_name']));
        }
        if (array_key_exists('client_phone', $input)) {
            $set('client_phone', $this->short($input['client_phone'], 64, 'Телефон'));
        }
        if (array_key_exists('client_company', $input)) {
            $set('client_company', $this->short($input['client_company'], 255, 'Компания'));
        }
        if (array_key_exists('details', $input)) {
            $set('details', $this->details($input['details']));
        }
        if (array_key_exists('notes', $input)) {
            $set('notes', $this->notes($input['notes']));
        }
        if (array_key_exists('valid_until', $input)) {
            $set('valid_until', $this->date($input['valid_until']));
        }
        if (array_key_exists('status', $input)) {
            $set('status', $this->status($input['status']));
        }
        $items = $this->hasItems($input) ? KpTotals::items($input['items']) : ($current['items'] !== [] ? $current['items'] : null);
        $discountGiven = array_key_exists('discount_type', $input) || array_key_exists('discount_value', $input);
        [$discountType, $discountValue] = $discountGiven
            ? $this->discount($input)
            : [$current['discount_type'], $current['discount_value']];
        if ($this->hasItems($input)) {
            $set('items_json', json_encode($items, JSON_UNESCAPED_UNICODE));
        }
        if ($discountGiven) {
            $set('discount_type', $discountType);
            $set('discount_value', $discountValue);
        }
        if ($items !== null) {
            $set('amount', number_format(KpTotals::total($items, $discountType, $discountValue), 2, '.', ''));
        } else {
            if (array_key_exists('amount', $input)) {
                $set('amount', $this->amount($input['amount']));
            }
            if (array_key_exists('pdf_url', $input)) {
                $set('pdf_url', $this->pdfUrl($input['pdf_url']));
            }
        }
        if ($sets === []) {
            throw new AppException('Нет полей для изменения', 422);
        }
        $params[] = $id;
        Database::pdo()->prepare('UPDATE kp_offers SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        $statusOnly = array_diff(array_keys($input), ['status']) === [];
        if ($items !== null && (!$statusOnly || $current['pdf_path'] === null)) {
            $this->generatePdf($id);
        }

        return $this->get($id);
    }

    /** Renders and stores the PDF, then points pdf_url at the authenticated download endpoint. */
    public function generatePdf(int $id): void
    {
        $kp = $this->get($id);
        $stmt = Database::pdo()->prepare('SELECT name, email FROM users WHERE id = ?');
        $stmt->execute([$kp['author_user_id'] ?? 0]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $author = [
            'name' => (string) ($user['name'] ?? $kp['author']),
            'email' => (string) ($user['email'] ?? ''),
            'phone' => '',
            'position' => '',
        ];
        $subtotal = KpTotals::subtotal($kp['items']);
        $view = [
            'number' => $kp['number'],
            'created' => date('d.m.Y', strtotime($kp['created_at']) ?: time()),
            'client_name' => $kp['client_name'],
            'client_company' => $kp['client_company'],
            'client_phone' => $kp['client_phone'],
            'items' => $kp['items'],
            'subtotal' => $subtotal,
            'discount' => KpTotals::discount($subtotal, $kp['discount_type'], $kp['discount_value']),
            'discount_label' => $kp['discount_type'] === 'percent' ? rtrim(rtrim(number_format((float) $kp['discount_value'], 2, ',', ''), '0'), ',') . '%' : '',
            'amount' => $kp['amount'],
            'notes' => $kp['notes'],
            'valid_until' => $kp['valid_until'] !== null ? date('d.m.Y', strtotime($kp['valid_until']) ?: time()) : null,
        ];
        $name = $this->pdf->store($id, $this->pdf->render($this->pdf->html($view, $author)));
        $url = rtrim((string) Config::get('app.url', ''), '/') . '/api/kp/' . $id . '/pdf';
        Database::pdo()->prepare('UPDATE kp_offers SET pdf_path = ?, pdf_generated_at = NOW(), pdf_url = ? WHERE id = ?')
            ->execute([$name, $url, $id]);
    }

    /** @return array{path: string, name: string} */
    public function pdfFile(int $id): array
    {
        $kp = $this->get($id);
        $path = $kp['pdf_path'] !== null ? KpPdfService::path($kp['pdf_path']) : null;
        if ($path === null && $kp['items'] !== []) {
            $this->generatePdf($id);
            $kp = $this->get($id);
            $path = $kp['pdf_path'] !== null ? KpPdfService::path($kp['pdf_path']) : null;
        }
        if ($path === null) {
            throw new AppException('У этого КП нет PDF', 404);
        }

        return ['path' => $path, 'name' => $kp['number'] . ' ' . $kp['client_name'] . '.pdf'];
    }

    private function select(): string
    {
        return 'SELECT k.*, u.name AS author_user_name FROM kp_offers k LEFT JOIN users u ON u.id = k.author_user_id';
    }

    /** @param array<string, mixed> $r @return array<string, mixed> */
    private function present(array $r): array
    {
        $status = (string) $r['status'];
        $author = $r['author_token_name'] !== null && $r['author_token_name'] !== ''
            ? 'API: ' . $r['author_token_name']
            : (string) ($r['author_user_name'] ?? '—');

        $items = is_string($r['items_json'] ?? null) ? json_decode($r['items_json'], true) : null;

        return [
            'id' => (int) $r['id'],
            'number' => $r['number'] !== null ? (string) $r['number'] : sprintf('КП-%04d', (int) $r['id']),
            'client_name' => (string) $r['client_name'],
            'client_phone' => (string) ($r['client_phone'] ?? ''),
            'client_company' => (string) ($r['client_company'] ?? ''),
            'items' => is_array($items) ? $items : [],
            'discount_type' => $r['discount_type'] !== null ? (string) $r['discount_type'] : null,
            'discount_value' => $r['discount_value'] !== null ? (float) $r['discount_value'] : null,
            'notes' => (string) ($r['notes'] ?? ''),
            'valid_until' => $r['valid_until'] !== null ? (string) $r['valid_until'] : null,
            'pdf_path' => $r['pdf_path'] !== null ? (string) $r['pdf_path'] : null,
            'pdf_generated' => $r['pdf_path'] !== null,
            'amount' => (float) $r['amount'],
            'details' => $r['details'] !== null ? (string) $r['details'] : '',
            'pdf_url' => $r['pdf_url'] !== null ? (string) $r['pdf_url'] : null,
            'status' => $status,
            'status_label' => self::STATUSES[$status] ?? $status,
            'author' => $author,
            'author_user_id' => $r['author_user_id'] !== null ? (int) $r['author_user_id'] : null,
            'author_token_name' => $r['author_token_name'] !== null ? (string) $r['author_token_name'] : null,
            'created_at' => (string) $r['created_at'],
            'updated_at' => (string) $r['updated_at'],
        ];
    }

    private function clientName(mixed $v): string
    {
        $v = is_string($v) ? trim($v) : '';
        if ($v === '' || mb_strlen($v) > 255) {
            throw new AppException('Укажите имя клиента (до 255 символов)', 422);
        }

        return $v;
    }

    private function amount(mixed $v): string
    {
        if (is_string($v)) {
            $v = str_replace([' ', ','], ['', '.'], trim($v));
        }
        if (!is_numeric($v) || (float) $v < 0 || (float) $v > 999999999999) {
            throw new AppException('Сумма должна быть неотрицательным числом', 422);
        }

        return number_format((float) $v, 2, '.', '');
    }

    /** @param array<string, mixed> $input */
    private function hasItems(array $input): bool
    {
        return array_key_exists('items', $input) && $input['items'] !== null && $input['items'] !== [];
    }

    /** @param array<string, mixed> $input @return array{0: ?string, 1: ?float} */
    private function discount(array $input): array
    {
        $value = $input['discount_value'] ?? null;
        if ($value === null || $value === '' || $value === 0 || $value === '0') {
            return [null, null];
        }
        $type = $input['discount_type'] ?? 'amount';
        if (!in_array($type, self::DISCOUNT_TYPES, true)) {
            throw new AppException('Скидка: percent или amount', 422);
        }
        $v = KpTotals::number($value, 'Скидка — неотрицательное число');
        if ($type === 'percent' && $v > 100) {
            throw new AppException('Скидка не больше 100%', 422);
        }

        return [$type, $v];
    }

    private function short(mixed $v, int $max, string $label): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_string($v) || mb_strlen(trim($v)) > $max) {
            throw new AppException("{$label}: текст до {$max} символов", 422);
        }

        return trim($v) === '' ? null : trim($v);
    }

    private function notes(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_string($v) || mb_strlen($v) > 5000) {
            throw new AppException('Условия — текст до 5000 символов', 422);
        }

        return $v;
    }

    private function date(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $d = is_string($v) ? \DateTimeImmutable::createFromFormat('!Y-m-d', $v) : false;
        if ($d === false || $d->format('Y-m-d') !== $v) {
            throw new AppException('Срок действия — дата ГГГГ-ММ-ДД', 422);
        }

        return $v;
    }

    private function details(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        if (!is_string($v) || mb_strlen($v) > 20000) {
            throw new AppException('Детали — текст до 20000 символов', 422);
        }

        return $v;
    }

    private function pdfUrl(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_string($v)) {
            throw new AppException('pdf_url должен быть ссылкой http(s)', 422);
        }

        return $this->httpUrl(trim($v), 'pdf_url должен быть ссылкой http(s)');
    }

    private function httpUrl(string $url, string $error): string
    {
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if (mb_strlen($url) > 1000 || !in_array($scheme, ['http', 'https'], true) || filter_var($url, FILTER_VALIDATE_URL) === false) {
            throw new AppException($error, 422);
        }

        return $url;
    }

    private function status(mixed $v): string
    {
        $v = is_string($v) ? mb_strtolower(trim($v)) : '';
        if (isset(self::STATUSES[$v])) {
            return $v;
        }
        $code = array_search($v, self::STATUSES, true);
        if (is_string($code)) {
            return $code;
        }
        throw new AppException('Статус: черновик, отправлено, принято или отклонено', 422);
    }

    /** @param array<string, mixed> $actor */
    private function authorId(array $actor): ?int
    {
        $id = (int) ($actor['user_id'] ?? 0);

        return $id > 0 ? $id : null;
    }

    /** @param array<string, mixed> $actor */
    private function tokenName(array $actor): ?string
    {
        $name = $actor['token_name'] ?? null;

        return is_string($name) && $name !== '' ? $name : null;
    }
}
