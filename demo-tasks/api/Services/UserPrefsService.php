<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;
use Trx\Security\Policy;

final class UserPrefsService
{
    private const MAX_SAVED_FILTERS = 20;

    /** @return array{saved_filters: list<array{name:string,query:string}>, widget_order: list<string>|null, hidden_widgets: list<string>, sidebar_order: list<string>|null} */
    public function get(int $userId): array
    {
        $stmt = Database::pdo()->prepare('SELECT widget_order, saved_filters, sidebar_order FROM user_prefs WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $widgets = json_decode((string) ($row['widget_order'] ?? 'null'), true);
        $filters = json_decode((string) ($row['saved_filters'] ?? '[]'), true);

        return [
            'saved_filters' => is_array($filters) ? array_values($filters) : [],
            'widget_order' => is_array($widgets['order'] ?? null) ? array_values($widgets['order']) : null,
            'hidden_widgets' => is_array($widgets['hidden'] ?? null) ? array_values($widgets['hidden']) : [],
            'sidebar_order' => self::validSidebarOrder(json_decode((string) ($row['sidebar_order'] ?? 'null'), true)),
        ];
    }

    /** @param array<string, mixed> $input */
    public function update(int $userId, array $input): array
    {
        $current = $this->get($userId);
        if (array_key_exists('saved_filters', $input)) {
            $current['saved_filters'] = $this->sanitizeFilters($input['saved_filters']);
        }
        if (array_key_exists('widget_order', $input)) {
            $current['widget_order'] = $this->sanitizeKeys($input['widget_order']);
        }
        if (array_key_exists('hidden_widgets', $input)) {
            $current['hidden_widgets'] = $this->sanitizeKeys($input['hidden_widgets']) ?? [];
        }
        if (array_key_exists('sidebar_order', $input)) {
            if ($input['sidebar_order'] !== null && !is_array($input['sidebar_order'])) {
                throw new AppException('Неверный формат списка');
            }
            $current['sidebar_order'] = self::validSidebarOrder($input['sidebar_order']);
        }
        Database::pdo()->prepare(
            'INSERT INTO user_prefs (user_id, widget_order, saved_filters, sidebar_order) VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE widget_order = VALUES(widget_order), saved_filters = VALUES(saved_filters), sidebar_order = VALUES(sidebar_order)'
        )->execute([
            $userId,
            json_encode(['order' => $current['widget_order'], 'hidden' => $current['hidden_widgets']], JSON_UNESCAPED_UNICODE),
            json_encode($current['saved_filters'], JSON_UNESCAPED_UNICODE),
            $current['sidebar_order'] === null ? null : json_encode($current['sidebar_order']),
        ]);

        return $current;
    }

    /**
     * Known nav keys only, no duplicates. Empty or not a list = default order (null).
     *
     * @return list<string>|null
     */
    public static function validSidebarOrder(mixed $value): ?array
    {
        if (!is_array($value)) {
            return null;
        }
        $known = array_column(Policy::navItems(), 'key');
        $out = [];
        foreach ($value as $key) {
            if (is_string($key) && in_array($key, $known, true) && !in_array($key, $out, true)) {
                $out[] = $key;
            }
        }

        return $out === [] ? null : $out;
    }

    /**
     * Saved keys first, then any item missing from the saved list in default order.
     *
     * @param list<string>|null $saved
     * @return list<string>
     */
    public static function mergeSidebarOrder(?array $saved): array
    {
        $default = array_column(Policy::navItems(), 'key');
        $first = self::validSidebarOrder($saved) ?? [];

        return array_values(array_merge($first, array_diff($default, $first)));
    }

    /** @return list<array{name:string,query:string}> */
    private function sanitizeFilters(mixed $value): array
    {
        if (!is_array($value)) {
            throw new AppException('Неверный формат фильтров');
        }
        $out = [];
        foreach ($value as $item) {
            $name = trim((string) ($item['name'] ?? ''));
            $query = trim((string) ($item['query'] ?? ''));
            if ($name === '' || mb_strlen($query) > 500) {
                continue;
            }
            $out[] = ['name' => mb_substr($name, 0, 60), 'query' => ltrim($query, '?')];
        }

        return array_slice($out, 0, self::MAX_SAVED_FILTERS);
    }

    /** @return list<string>|null */
    private function sanitizeKeys(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        if (!is_array($value)) {
            throw new AppException('Неверный формат списка');
        }

        return array_values(array_unique(array_filter(
            array_map(static fn ($v) => preg_replace('/[^a-z_]/', '', (string) $v) ?? '', $value),
            static fn ($v) => $v !== ''
        )));
    }
}
