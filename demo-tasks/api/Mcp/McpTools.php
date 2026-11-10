<?php

declare(strict_types=1);

namespace Trx\Mcp;

use Trx\Repositories\TaskRepository;
use Trx\Security\Policy;
use Trx\Services\AppException;
use Trx\Services\CashService;
use Trx\Services\McpCrmService;
use Trx\Services\MeetingService;
use Trx\Services\MiniChatService;
use Trx\Services\TaskService;

/**
 * MCP tools. Descriptions are Russian. Dates are Asia/Almaty (UTC+5).
 * A tool failure is returned as a result with isError, not as a JSON-RPC error.
 */
final class McpTools
{
    private const DATE_HELP = 'Время в Asia/Almaty (UTC+5), формат YYYY-MM-DD HH:MM:SS. Если в строке есть пояс, он переводится в UTC+5.';

    public function __construct(
        private readonly TaskService $tasks = new TaskService(),
        private readonly TaskRepository $taskRows = new TaskRepository(),
        private readonly McpCrmService $crm = new McpCrmService(),
        private readonly MeetingService $meetings = new MeetingService(),
        private readonly CashService $cash = new CashService(),
        private readonly MiniChatService $chat = new MiniChatService(),
        private readonly Policy $policy = new Policy(),
    ) {
    }

    /** @return list<array{name: string, description: string, inputSchema: array<string, mixed>}> */
    public function definitions(): array
    {
        $delete = $this->schema(
            ['id' => $this->intProp('Точный числовой id. Другие поля запрещены: удаляется только эта запись.')],
            ['id'],
            false,
        );

        return [
            $this->tool('list_tasks', 'Список задач, которые видит сотрудник токена. Чужие задачи скрыты, если нет права видеть все. Срок due_at в UTC+5.', $this->schema([
                'status' => $this->str('Статусы через запятую: new, in_progress, on_review, done, cancelled'),
                'assignee_id' => $this->intProp('Любой из ответственных'),
                'scope' => $this->str('mine, created, on_review или overdue'),
                'priority' => $this->str('low, medium или high'),
                'due' => $this->str('today, overdue, week или none'),
                'q' => $this->str('Поиск по названию, номеру или имени ответственного'),
                'limit' => $this->intProp('Сколько записей вернуть, не больше 100'),
            ])),
            $this->tool('create_task', 'Создать задачу. Несколько ответственных передаются в assignee_ids, первый становится основным.', $this->schema([
                'title' => $this->str('Название'),
                'description' => $this->str('Описание'),
                'assignee_ids' => $this->intList('Id ответственных. Если пусто, задача назначается на сотрудника токена.'),
                'priority' => $this->str('low, medium или high'),
                'is_urgent' => $this->boolProp('true — задача срочная: первая в списке, карточка красная, ответственные получают уведомление'),
                'starts_at' => $this->str(self::DATE_HELP),
                'due_at' => $this->str(self::DATE_HELP),
                'client_id' => $this->intProp('Клиент'),
                'deal_id' => $this->intProp('Сделка'),
            ], ['title'])),
            $this->tool('update_task', 'Изменить задачу или её статус. Закрытую задачу меняет только владелец. Возврат с проверки требует comment, отмена — cancel_reason.', $this->schema([
                'id' => $this->intProp('Id задачи'),
                'title' => $this->str('Название'),
                'description' => $this->str('Описание'),
                'assignee_ids' => $this->intList('Новый полный список ответственных'),
                'priority' => $this->str('low, medium или high'),
                'is_urgent' => $this->boolProp('true — пометить срочной, false — снять метку'),
                'starts_at' => $this->str(self::DATE_HELP),
                'due_at' => $this->str(self::DATE_HELP),
                'status' => $this->str('new, in_progress, on_review, done или cancelled'),
                'comment' => $this->str('Комментарий, обязателен при возврате с проверки'),
                'cancel_reason' => $this->str('Причина отмены'),
            ], ['id'])),
            $this->tool('delete_task', 'Удалить одну задачу по точному id. Запись, которую сотрудник не видит, не удаляется.', $delete),
            $this->tool('list_deals', 'Сделки воронки. Суммы в тенге. Этап — slug из list_pipeline_stages.', $this->schema([
                'stage' => $this->str('Slug этапа'),
                'client_id' => $this->intProp('Клиент'),
                'q' => $this->str('Поиск по названию, номеру или клиенту'),
                'limit' => $this->intProp('Не больше 100'),
            ])),
            $this->tool('create_deal', 'Создать сделку. Нужен client_id или client_name. Этап по умолчанию new_lead. Сумма — целое число тенге.', $this->schema([
                'title' => $this->str('Название'),
                'client_id' => $this->intProp('Существующий клиент'),
                'client_name' => $this->str('Имя нового клиента, если client_id не передан'),
                'phone' => $this->str('Телефон нового клиента'),
                'stage' => $this->str('Slug этапа, по умолчанию new_lead'),
                'amount' => $this->intProp('Сумма в тенге'),
                'owner_id' => $this->intProp('Ответственный сотрудник, по умолчанию сотрудник токена'),
                'source' => $this->str('Источник, по умолчанию grok'),
                'channel' => $this->str('Канал, по умолчанию offline'),
            ], ['title'])),
            $this->tool('update_deal', 'Изменить сделку. Смена stage проверяет правила воронки и может создать задачу на следующее действие.', $this->schema([
                'id' => $this->intProp('Id сделки'),
                'title' => $this->str('Название'),
                'amount' => $this->intProp('Сумма в тенге'),
                'owner_id' => $this->intProp('Ответственный'),
                'stage' => $this->str('Новый slug этапа'),
                'source' => $this->str('Источник'),
                'loss_reason' => $this->str('Причина отказа для этапа lost'),
                'next_contact_at' => $this->str(self::DATE_HELP),
                'client_replied' => ['type' => 'boolean', 'description' => 'Клиент ответил'],
                'client_task' => $this->str('Задача клиента'),
                'product' => $this->str('Товар'),
                'requirements' => $this->str('Требования'),
                'objection' => $this->str('Возражение'),
                'payment_terms' => $this->str('Условия оплаты'),
            ], ['id'])),
            $this->tool('delete_deal', 'Удалить одну сделку по точному id. Сделку с заказом или оплатой удалить нельзя. Позиции и коммерческие предложения этой сделки удаляются вместе с ней.', $delete),
            $this->tool('list_pipeline_stages', 'Этапы воронки продаж: id, slug и название. Slug передаётся в сделки.', $this->schema([])),
            $this->tool('list_clients', 'Клиенты CRM.', $this->schema([
                'q' => $this->str('Поиск по имени, компании или телефону'),
                'limit' => $this->intProp('Не больше 100'),
            ])),
            $this->tool('create_client', 'Создать клиента.', $this->schema([
                'name' => $this->str('Имя'),
                'phone' => $this->str('Телефон'),
                'company' => $this->str('Компания'),
                'language' => $this->str('ru, kk или en'),
            ], ['name'])),
            $this->tool('update_client', 'Изменить клиента по точному id.', $this->schema([
                'id' => $this->intProp('Id клиента'),
                'name' => $this->str('Имя'),
                'phone' => $this->str('Телефон'),
                'company' => $this->str('Компания'),
                'language' => $this->str('ru, kk или en'),
            ], ['id'])),
            $this->tool('delete_client', 'Удалить одного клиента по точному id. Если у клиента есть сделки, удаление отменяется.', $delete),
            $this->tool('list_meetings', 'Встречи. Время в UTC+5.', $this->schema([
                'from' => $this->str(self::DATE_HELP),
                'to' => $this->str(self::DATE_HELP),
                'limit' => $this->intProp('Не больше 100'),
            ])),
            $this->tool('create_meeting', 'Создать встречу. Организатор — сотрудник токена. participant_ids — сотрудники.', $this->schema([
                'title' => $this->str('Тема'),
                'starts_at' => $this->str(self::DATE_HELP),
                'ends_at' => $this->str(self::DATE_HELP),
                'location' => $this->str('Место'),
                'notes' => $this->str('Заметки'),
                'client_id' => $this->intProp('Клиент'),
                'participant_ids' => $this->intList('Id сотрудников-участников'),
            ], ['title', 'starts_at'])),
            $this->tool('update_meeting', 'Изменить встречу по точному id.', $this->schema([
                'id' => $this->intProp('Id встречи'),
                'title' => $this->str('Тема'),
                'starts_at' => $this->str(self::DATE_HELP),
                'ends_at' => $this->str(self::DATE_HELP),
                'location' => $this->str('Место'),
                'notes' => $this->str('Заметки'),
                'client_id' => $this->intProp('Клиент'),
                'participant_ids' => $this->intList('Новый список участников'),
            ], ['id'])),
            $this->tool('delete_meeting', 'Удалить одну встречу по точному id.', $delete),
            $this->tool('list_cash', 'Кассовые операции в тенге: приход income и расход expense. Удаления нет.', $this->schema([
                'kind' => $this->str('income или expense'),
                'from' => $this->str('Дата с, YYYY-MM-DD'),
                'to' => $this->str('Дата по, YYYY-MM-DD'),
                'limit' => $this->intProp('Не больше 100'),
            ])),
            $this->tool('create_cash', 'Записать приход или расход. Сумма — целое число тенге. Операция не удаляется.', $this->schema([
                'kind' => $this->str('income — приход, expense — расход'),
                'amount' => $this->intProp('Сумма в тенге, больше нуля'),
                'occurred_on' => $this->str('Дата операции YYYY-MM-DD, по умолчанию сегодня в UTC+5'),
                'comment' => $this->str('Комментарий'),
                'client_id' => $this->intProp('Клиент, если операция с ним связана'),
            ], ['kind', 'amount'])),
            $this->tool('list_contacts', 'Сотрудники компании с телефонами: id, имя, телефон. Для исходящих сообщений.', $this->schema([])),
            $this->tool('post_assistant_reply', 'Записать ответ бота в мини-чат сотрудника. commandId — идентификатор его команды.', $this->schema([
                'userId' => $this->intProp('Id сотрудника, чей чат'),
                'commandId' => $this->str('commandId команды этого сотрудника'),
                'text' => $this->str('Текст ответа'),
            ], ['userId', 'commandId', 'text'])),
            $this->tool('log_outgoing_message', 'Записать факт исходящего сообщения сотруднику. Текст хранится в журнале сообщений, не в журнале MCP.', $this->schema([
                'contactId' => $this->intProp('Id сотрудника из list_contacts'),
                'channel' => $this->str('Канал, например whatsapp'),
                'text' => $this->str('Текст сообщения'),
                'status' => $this->str('Статус доставки, например sent или failed'),
            ], ['contactId', 'channel', 'text', 'status'])),
        ];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $arguments
     * @return array{content: list<array{type: string, text: string}>, isError: bool}
     */
    public function call(array $user, string $name, array $arguments): array
    {
        try {
            $data = match ($name) {
                'list_tasks' => $this->listTasks($user, $arguments),
                'create_task' => $this->compactTask($this->tasks->create($user, $arguments)),
                'update_task' => $this->updateTask($user, $arguments),
                'delete_task' => $this->deleteTask($user, $arguments),
                'list_deals' => $this->crm->listDeals($user, $arguments),
                'create_deal' => $this->crm->createDeal($user, $arguments),
                'update_deal' => $this->crm->updateDeal($user, $arguments),
                'delete_deal' => $this->crm->deleteDeal($user, $arguments),
                'list_pipeline_stages' => $this->crm->stages($user),
                'list_clients' => $this->crm->listClients($user, $arguments),
                'create_client' => $this->crm->createClient($user, $arguments),
                'update_client' => $this->crm->updateClient($user, $arguments),
                'delete_client' => $this->crm->deleteClient($user, $arguments),
                'list_meetings' => $this->meetings->list($user, $arguments),
                'create_meeting' => $this->meetings->create($user, $arguments),
                'update_meeting' => $this->meetings->update($user, $arguments),
                'delete_meeting' => $this->meetings->delete($user, $arguments),
                'list_cash' => $this->cash->list($user, $arguments),
                'create_cash' => $this->cash->create($user, $arguments),
                'list_contacts' => $this->crm->contacts($user),
                'post_assistant_reply' => $this->chat->reply(
                    $user,
                    is_int($arguments['userId'] ?? null) ? $arguments['userId'] : 0,
                    (string) ($arguments['commandId'] ?? ''),
                    (string) ($arguments['text'] ?? ''),
                ),
                'log_outgoing_message' => $this->crm->logOutgoing($user, $arguments),
                default => throw new AppException('Неизвестный инструмент'),
            };

            return $this->ok($data);
        } catch (AppException $e) {
            return $this->fail($e->getMessage());
        } catch (\Throwable $e) {
            error_log('DEMO mcp tool: ' . $e->getMessage());

            return $this->fail('Не удалось выполнить инструмент');
        }
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    private function listTasks(array $user, array $filters): array
    {
        if (!$this->policy->can($user, 'tasks', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
        $limit = isset($filters['limit']) && is_int($filters['limit']) ? $filters['limit'] : 50;
        $limit = min(100, max(1, $limit));
        $rows = $this->taskRows->list($user, $filters);
        $items = [];
        foreach (array_slice($rows, 0, $limit) as $row) {
            $items[] = $this->compactTask($row);
        }

        return ['timezone' => 'Asia/Almaty', 'items' => $items];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private function updateTask(array $user, array $input): array
    {
        $id = $input['id'] ?? null;
        if (!is_int($id) || $id <= 0) {
            throw new AppException('Укажите точный id', 422);
        }
        $fields = array_intersect_key($input, array_flip([
            'title', 'description', 'assignee_ids', 'assignee_id', 'priority', 'is_urgent', 'starts_at', 'due_at', 'deal_id', 'client_id',
        ]));
        $task = $fields === [] ? null : $this->tasks->update($user, $id, $fields);
        if (isset($input['status'])) {
            $task = $this->tasks->transition($user, $id, [
                'status' => $input['status'],
                'comment' => $input['comment'] ?? '',
                'cancel_reason' => $input['cancel_reason'] ?? '',
            ]);
        }
        if ($task === null) {
            throw new AppException('Нечего обновлять', 422);
        }

        return $this->compactTask($task);
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    private function deleteTask(array $user, array $input): array
    {
        if (array_keys($input) !== ['id'] || !is_int($input['id'] ?? null) || $input['id'] <= 0) {
            throw new AppException('Удаление только по точному id', 422);
        }
        $id = $input['id'];
        $this->tasks->delete($user, $id);

        return ['deleted' => true, 'id' => $id];
    }

    /** @param array<string, mixed> $task @return array<string, mixed> */
    private function compactTask(array $task): array
    {
        $people = [];
        $ids = [];
        foreach ($task['assignees'] ?? [] as $person) {
            if (!is_array($person)) {
                continue;
            }
            $pid = (int) ($person['id'] ?? 0);
            $ids[] = $pid;
            $people[] = ['id' => $pid, 'name' => (string) ($person['name'] ?? '')];
        }
        if ($ids === [] && !empty($task['assignee_id'])) {
            $ids[] = (int) $task['assignee_id'];
            $people[] = ['id' => (int) $task['assignee_id'], 'name' => (string) ($task['assignee_name'] ?? '')];
        }

        return [
            'id' => (int) ($task['id'] ?? 0),
            'number' => (string) ($task['number'] ?? ''),
            'title' => (string) ($task['title'] ?? ''),
            'status' => (string) ($task['status'] ?? ''),
            'priority' => (string) ($task['priority'] ?? ''),
            'is_urgent' => (int) ($task['is_urgent'] ?? 0) === 1 ? 1 : 0,
            'due_at' => $task['due_at'] ?? null,
            'starts_at' => $task['starts_at'] ?? null,
            'is_overdue' => (bool) ($task['is_overdue'] ?? false),
            'assignee_ids' => $ids,
            'assignees' => $people,
            'creator_id' => isset($task['creator_id']) ? (int) $task['creator_id'] : null,
            'timezone' => 'Asia/Almaty',
        ];
    }

    /** @param array<string, mixed> $data @return array{content: list<array{type: string, text: string}>, isError: bool} */
    private function ok(array $data): array
    {
        return [
            'content' => [[
                'type' => 'text',
                'text' => (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]],
            'isError' => false,
        ];
    }

    /** @return array{content: list<array{type: string, text: string}>, isError: bool} */
    private function fail(string $message): array
    {
        return [
            'content' => [['type' => 'text', 'text' => $message]],
            'isError' => true,
        ];
    }

    /** @param array<string, mixed> $schema @return array{name: string, description: string, inputSchema: array<string, mixed>} */
    private function tool(string $name, string $description, array $schema): array
    {
        return ['name' => $name, 'description' => $description, 'inputSchema' => $schema];
    }

    /**
     * @param array<string, mixed> $properties
     * @param list<string> $required
     * @return array<string, mixed>
     */
    private function schema(array $properties, array $required = [], bool $additional = true): array
    {
        return [
            'type' => 'object',
            'properties' => $properties === [] ? new \stdClass() : $properties,
            'required' => $required,
            'additionalProperties' => $additional,
        ];
    }

    /** @return array<string, mixed> */
    private function str(string $description): array
    {
        return ['type' => 'string', 'description' => $description];
    }

    /** @return array<string, mixed> */
    private function intProp(string $description): array
    {
        return ['type' => 'integer', 'description' => $description];
    }

    /** @return array<string, mixed> */
    private function boolProp(string $description): array
    {
        return ['type' => 'boolean', 'description' => $description];
    }

    /** @return array<string, mixed> */
    private function intList(string $description): array
    {
        return [
            'type' => 'array',
            'items' => ['type' => 'integer'],
            'description' => $description,
        ];
    }
}
