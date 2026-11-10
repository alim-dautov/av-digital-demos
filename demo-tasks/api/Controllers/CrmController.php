<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\CrmService;

final class CrmController
{
    public function __construct(private readonly CrmService $crm = new CrmService())
    {
    }

    /** @param array<string, mixed> $user */
    public function board(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->board($user, [
            'channel' => $request->query['channel'] ?? '',
            'owner_id' => $request->query['owner_id'] ?? '',
            'source' => $request->query['source'] ?? '',
        ]));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function show(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->showDeal($user, (int) $params['id']));
    }

    /** @param array<string, mixed> $user */
    public function ingest(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->ingestLead($user, $request->body), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function move(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->move($user, (int) $params['id'], (string) $request->input('stage', ''), $request->body));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function addItem(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->addItem($user, (int) $params['id'], $request->body), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function createQuote(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->createQuote($user, (int) $params['id']), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function sendQuote(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->sendQuote($user, (int) $params['id'], (string) $request->input('via', 'manual')));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function quoteHtml(Request $request, array $user, array $params): void
    {
        try {
            $html = $this->crm->quoteHtmlById($user, (int) $params['id']);
            http_response_code(200);
            header('Content-Type: text/html; charset=utf-8');
            echo $html;
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function pushOrder(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->pushOrder($user, (int) $params['id'], (string) ($request->header('x-idempotency-key') ?? '')));
    }

    /** @param array<string, mixed> $user */
    public function oneCPayment(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->applyOneCPayment(
            $user,
            (string) $request->input('document_id', ''),
            (int) $request->input('amount', 0),
            (string) $request->input('kind', 'payment'),
            (string) ($request->header('x-idempotency-key') ?? $request->input('idempotency_key', ''))
        ));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function manualPayment(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->manualPayment(
            $user,
            (int) $params['id'],
            (int) $request->input('amount', 0),
            (string) $request->input('evidence', '')
        ));
    }

    /** @param array<string, mixed> $user */
    public function call(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->ingestCall($user, $request->body));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function analyze(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->analyzeCall($user, (int) $params['id'], $request->input('transcript')));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function applySuggestion(Request $request, array $user, array $params): void
    {
        $this->run(fn () => $this->crm->applySuggestion($user, (int) $params['id']));
    }

    /** @param array<string, mixed> $user */
    public function sync(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->syncCatalog($user));
    }

    /** @param array<string, mixed> $user */
    public function warehouse(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->warehouse($user));
    }

    /** @param array<string, mixed> $user */
    public function report(Request $request, array $user): void
    {
        $from = (string) ($request->query['from'] ?? date('Y-m-01'));
        $to = (string) ($request->query['to'] ?? date('Y-m-d'));
        $this->run(fn () => $this->crm->report($user, $from, $to));
    }

    /** @param array<string, mixed> $user */
    public function drill(Request $request, array $user): void
    {
        $from = (string) ($request->query['from'] ?? date('Y-m-01'));
        $to = (string) ($request->query['to'] ?? date('Y-m-d'));
        $this->run(fn () => $this->crm->drill($user, (string) ($request->query['metric'] ?? 'new_leads'), $from, $to));
    }

    /** @param array<string, mixed> $user */
    public function team(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->team($user));
    }

    /** @param array<string, mixed> $user */
    public function bot(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->botTurn(
            $user,
            (string) $request->input('channel', 'test'),
            (string) $request->input('external_user', ''),
            (string) $request->input('text', '')
        ));
    }

    /** @param array<string, mixed> $user */
    public function botReturn(Request $request, array $user): void
    {
        $this->run(fn () => $this->crm->returnBot(
            $user,
            (string) $request->input('channel', 'test'),
            (string) $request->input('external_user', '')
        ));
    }

    private function run(callable $fn, int $status = 200): void
    {
        try {
            Response::json($fn(), $status);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }
}
