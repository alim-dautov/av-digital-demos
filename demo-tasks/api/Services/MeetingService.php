<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Security\Policy;

final class MeetingService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function list(array $user, array $filters): array
    {
        $this->allow($user);
        $sql = 'SELECT m.id, m.title, m.starts_at, m.ends_at, m.location, m.notes, m.client_id, m.organizer_id,
                       c.name AS client_name, u.name AS organizer_name
                FROM meetings m
                JOIN users u ON u.id = m.organizer_id
                LEFT JOIN clients c ON c.id = m.client_id
                WHERE 1 = 1';
        $params = [];
        if (!empty($filters['from'])) {
            $sql .= ' AND m.starts_at >= ?';
            $params[] = $this->dateTime((string) $filters['from']);
        }
        if (!empty($filters['to'])) {
            $sql .= ' AND m.starts_at <= ?';
            $params[] = $this->dateTime((string) $filters['to']);
        }
        $sql .= ' ORDER BY m.starts_at, m.id LIMIT ' . $this->limit($filters['limit'] ?? 50);
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $items = [];
        foreach ($rows as $row) {
            $items[] = $this->present($row);
        }

        return ['timezone' => 'Asia/Almaty', 'items' => $items];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(array $user, array $input): array
    {
        $this->allow($user);
        $title = $this->title($input['title'] ?? '');
        $starts = $this->dateTime($input['starts_at'] ?? null);
        $ends = $this->optionalDate($input['ends_at'] ?? null);
        $this->assertOrder($starts, $ends);
        $clientId = $this->optionalClient($input['client_id'] ?? null);
        $participants = $this->participants($input['participant_ids'] ?? [], (int) $user['user_id']);
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO meetings (title, starts_at, ends_at, location, notes, client_id, organizer_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $title,
            $starts,
            $ends,
            $this->short($input['location'] ?? null, 255),
            $this->notes($input['notes'] ?? null),
            $clientId,
            (int) $user['user_id'],
        ]);
        $id = (int) $pdo->lastInsertId();
        $this->replaceParticipants($id, $participants);
        $this->audit->log((int) $user['user_id'], 'meeting', (string) $id, 'create', null, ['title' => $title]);

        return $this->one($id);
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function update(array $user, array $input): array
    {
        $this->allow($user);
        $id = $this->id($input);
        $current = $this->one($id);
        $changes = [];
        if (array_key_exists('title', $input)) {
            $changes['title'] = $this->title($input['title']);
        }
        if (array_key_exists('starts_at', $input)) {
            $changes['starts_at'] = $this->dateTime($input['starts_at']);
        }
        if (array_key_exists('ends_at', $input)) {
            $changes['ends_at'] = $this->optionalDate($input['ends_at']);
        }
        if (array_key_exists('location', $input)) {
            $changes['location'] = $this->short($input['location'], 255);
        }
        if (array_key_exists('notes', $input)) {
            $changes['notes'] = $this->notes($input['notes']);
        }
        if (array_key_exists('client_id', $input)) {
            $changes['client_id'] = $this->optionalClient($input['client_id']);
        }
        $starts = $changes['starts_at'] ?? $current['starts_at'];
        $ends = array_key_exists('ends_at', $changes) ? $changes['ends_at'] : $current['ends_at'];
        $this->assertOrder(is_string($starts) ? $starts : null, is_string($ends) ? $ends : null);
        if ($changes !== []) {
            $sets = implode(', ', array_map(static fn (string $field): string => "{$field} = ?", array_keys($changes)));
            Database::pdo()->prepare("UPDATE meetings SET {$sets} WHERE id = ?")->execute([...array_values($changes), $id]);
        }
        if (array_key_exists('participant_ids', $input)) {
            $this->replaceParticipants($id, $this->participants($input['participant_ids'], (int) $user['user_id']));
        }
        $this->audit->log((int) $user['user_id'], 'meeting', (string) $id, 'update', null, array_keys($changes));

        return $this->one($id);
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input */
    public function delete(array $user, array $input): array
    {
        $this->allow($user);
        $id = $this->exactId($input);
        $current = $this->one($id);
        Database::pdo()->prepare('DELETE FROM meetings WHERE id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'meeting', (string) $id, 'delete', ['title' => $current['title']], null);

        return ['deleted' => true, 'id' => $id];
    }

    /** @param array<string, mixed> $user */
    private function allow(array $user): void
    {
        $policy = $this->policy;
        foreach (['tasks', 'sales', 'team'] as $module) {
            if ($policy->can($user, $module, 'view')) {
                return;
            }
        }
        throw new AppException('Недостаточно прав', 403);
    }

    /** @param array<string, mixed> $input */
    private function exactId(array $input): int
    {
        if (array_keys($input) !== ['id']) {
            throw new AppException('Удаление только по точному id', 422);
        }

        return $this->id($input);
    }

    /** @param array<string, mixed> $input */
    private function id(array $input): int
    {
        $id = $input['id'] ?? null;
        if (!is_int($id) || $id <= 0) {
            throw new AppException('Укажите точный id', 422);
        }

        return $id;
    }

    /** @return array<string, mixed> */
    private function one(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT m.id, m.title, m.starts_at, m.ends_at, m.location, m.notes, m.client_id, m.organizer_id,
                    c.name AS client_name, u.name AS organizer_name
             FROM meetings m
             JOIN users u ON u.id = m.organizer_id
             LEFT JOIN clients c ON c.id = m.client_id
             WHERE m.id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Встреча не найдена', 404);
        }

        return $this->present($row);
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function present(array $row): array
    {
        $id = (int) $row['id'];

        return [
            'id' => $id,
            'title' => (string) $row['title'],
            'starts_at' => (string) $row['starts_at'],
            'ends_at' => $row['ends_at'] !== null ? (string) $row['ends_at'] : null,
            'location' => $row['location'] !== null ? (string) $row['location'] : null,
            'notes' => $row['notes'] !== null ? (string) $row['notes'] : null,
            'client_id' => $row['client_id'] !== null ? (int) $row['client_id'] : null,
            'client_name' => $row['client_name'] !== null ? (string) $row['client_name'] : null,
            'organizer_id' => (int) $row['organizer_id'],
            'organizer_name' => (string) $row['organizer_name'],
            'participant_ids' => $this->participantIds($id),
            'timezone' => 'Asia/Almaty',
        ];
    }

    /** @return list<int> */
    private function participantIds(int $meetingId): array
    {
        $stmt = Database::pdo()->prepare('SELECT user_id FROM meeting_participants WHERE meeting_id = ? ORDER BY user_id');
        $stmt->execute([$meetingId]);
        $ids = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $id) {
            $ids[] = (int) $id;
        }

        return $ids;
    }

    /** @param list<mixed> $raw @return list<int> */
    private function participants(mixed $raw, int $organizerId): array
    {
        if (!is_array($raw)) {
            throw new AppException('participant_ids должен быть списком id', 422);
        }
        $ids = [$organizerId];
        foreach ($raw as $id) {
            if (!is_int($id) || $id <= 0) {
                throw new AppException('Участник указывается точным id', 422);
            }
            if (!in_array($id, $ids, true)) {
                $ids[] = $id;
            }
        }
        $stmt = Database::pdo()->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1');
        foreach ($ids as $id) {
            $stmt->execute([$id]);
            if (!(int) $stmt->fetchColumn()) {
                throw new AppException('Сотрудник не найден', 422);
            }
        }

        return $ids;
    }

    /** @param list<int> $ids */
    private function replaceParticipants(int $meetingId, array $ids): void
    {
        $pdo = Database::pdo();
        $pdo->prepare('DELETE FROM meeting_participants WHERE meeting_id = ?')->execute([$meetingId]);
        $stmt = $pdo->prepare('INSERT INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)');
        foreach ($ids as $id) {
            $stmt->execute([$meetingId, $id]);
        }
    }

    private function title(mixed $value): string
    {
        $title = trim(is_string($value) ? $value : '');
        if ($title === '' || mb_strlen($title) > 255) {
            throw new AppException('Укажите название встречи до 255 символов', 422);
        }

        return $title;
    }

    private function dateTime(mixed $value): string
    {
        if (!is_string($value) || trim($value) === '') {
            throw new AppException('Укажите дату и время в формате YYYY-MM-DD HH:MM:SS (UTC+5)', 422);
        }
        $ts = strtotime($value);
        if ($ts === false) {
            throw new AppException('Неверный формат даты', 422);
        }

        return date('Y-m-d H:i:s', $ts);
    }

    private function optionalDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return $this->dateTime($value);
    }

    private function assertOrder(?string $starts, ?string $ends): void
    {
        if ($starts !== null && $ends !== null && $ends < $starts) {
            throw new AppException('Окончание встречи раньше начала', 422);
        }
    }

    private function optionalClient(mixed $value): ?int
    {
        if ($value === null || $value === '' || $value === 0) {
            return null;
        }
        if (!is_int($value) || $value <= 0) {
            throw new AppException('client_id должен быть числом', 422);
        }
        $stmt = Database::pdo()->prepare('SELECT id FROM clients WHERE id = ?');
        $stmt->execute([$value]);
        if (!(int) $stmt->fetchColumn()) {
            throw new AppException('Клиент не найден', 422);
        }

        return $value;
    }

    private function short(mixed $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) $value);

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    private function notes(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) $value);

        return $text === '' ? null : mb_substr($text, 0, 5000);
    }

    private function limit(mixed $value): int
    {
        $limit = is_int($value) ? $value : (int) $value;
        if ($limit <= 0) {
            $limit = 50;
        }

        return min(100, $limit);
    }
}
