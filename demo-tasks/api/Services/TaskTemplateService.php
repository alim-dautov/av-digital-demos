<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Security\Policy;

final class TaskTemplateService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @return list<array<string, mixed>>
     */
    public function list(array $user): array
    {
        $this->need($user, 'view');
        $rows = Database::pdo()->query(
            'SELECT t.*, d.name AS department_name, d.color AS department_color
             FROM task_templates t LEFT JOIN departments d ON d.id = t.department_id
             WHERE t.is_active = 1 ORDER BY t.title'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(fn (array $row): array => $this->map($row), $rows);
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public function save(array $user, ?int $id, array $input): array
    {
        $this->need($user, 'update');
        $title = trim((string) ($input['title'] ?? ''));
        $dept = (int) ($input['department_id'] ?? 0);
        $priority = (string) ($input['priority'] ?? 'medium');
        $dueIn = (int) ($input['due_in_hours'] ?? 8);
        if ($title === '') {
            throw new AppException('Укажите название');
        }
        $deptId = null;
        if ($dept > 0) {
            $known = Database::pdo()->prepare('SELECT 1 FROM departments WHERE id = ?');
            $known->execute([$dept]);
            if (!$known->fetchColumn()) {
                throw new AppException('Отдел не найден');
            }
            $deptId = $dept;
        }
        if (!in_array($priority, ['low', 'medium', 'high'], true)) {
            throw new AppException('Неизвестный приоритет');
        }
        if ($dueIn < 1 || $dueIn > 24 * 31) {
            throw new AppException('Срок выполнения — от 1 часа до 31 дня');
        }
        $checklist = array_values(array_filter(
            array_map(static fn ($v) => mb_substr(trim((string) $v), 0, 255), (array) ($input['checklist'] ?? [])),
            static fn ($v) => $v !== ''
        ));
        $kpiKey = trim((string) ($input['kpi_key'] ?? '')) ?: null;
        if ($kpiKey !== null && !(new WorkCalendarService())->indicatorExists($kpiKey)) {
            throw new AppException('Неизвестный показатель KPI');
        }
        if (!empty($input['requires_checklist']) && $checklist === []) {
            throw new AppException('Для обязательного чеклиста добавьте пункты');
        }
        $values = [
            mb_substr($title, 0, 255),
            trim((string) ($input['description'] ?? '')) ?: null,
            $deptId,
            $priority,
            json_encode($checklist, JSON_UNESCAPED_UNICODE),
            $dueIn,
            !empty($input['requires_file']) ? 1 : 0,
            !empty($input['requires_photo']) ? 1 : 0,
            !empty($input['requires_checklist']) ? 1 : 0,
            $kpiKey,
        ];
        $pdo = Database::pdo();
        if ($id === null) {
            $pdo->prepare(
                'INSERT INTO task_templates (title, description, department_id, priority, checklist, due_in_hours, requires_file, requires_photo, requires_checklist, kpi_key, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([...$values, (int) $user['user_id']]);
            $id = (int) $pdo->lastInsertId();
        } else {
            $this->find($id);
            $pdo->prepare(
                'UPDATE task_templates SET title = ?, description = ?, department_id = ?, priority = ?, checklist = ?, due_in_hours = ?, requires_file = ?, requires_photo = ?, requires_checklist = ?, kpi_key = ? WHERE id = ?'
            )->execute([...$values, $id]);
        }
        $this->audit->log((int) $user['user_id'], 'task_template', (string) $id, 'save', null, ['title' => $title]);

        return $this->map($this->find($id));
    }

    /** @param array<string, mixed> $user */
    public function archive(array $user, int $id): void
    {
        $this->need($user, 'update');
        $this->find($id);
        $pdo = Database::pdo();
        $pdo->prepare('UPDATE task_templates SET is_active = 0 WHERE id = ?')->execute([$id]);
        $pdo->prepare('UPDATE task_recurrences SET is_active = 0 WHERE template_id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'task_template', (string) $id, 'archive', null, null);
    }

    /** @return array<string, mixed> */
    public function find(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.*, d.name AS department_name, d.color AS department_color
             FROM task_templates t LEFT JOIN departments d ON d.id = t.department_id WHERE t.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Шаблон не найден', 404);
        }

        return $row;
    }

    /** @param array<string, mixed> $row */
    private function map(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'slug' => $row['slug'],
            'title' => $row['title'],
            'description' => $row['description'],
            'department_id' => $row['department_id'] !== null && $row['department_id'] !== '' ? (int) $row['department_id'] : null,
            'department_name' => $row['department_name'],
            'department_color' => $row['department_color'],
            'priority' => $row['priority'],
            'checklist' => json_decode((string) ($row['checklist'] ?? '[]'), true) ?: [],
            'due_in_hours' => (int) $row['due_in_hours'],
            'is_active' => (bool) $row['is_active'],
            'requires_file' => (bool) ($row['requires_file'] ?? false),
            'requires_photo' => (bool) ($row['requires_photo'] ?? false),
            'requires_checklist' => (bool) ($row['requires_checklist'] ?? false),
            'kpi_key' => $row['kpi_key'] ?? null,
        ];
    }

    /** @param array<string, mixed> $user */
    private function need(array $user, string $action): void
    {
        if (!$this->policy->can($user, 'tasks', $action)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }
}
