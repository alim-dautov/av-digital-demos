<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AnalyticsService;
use Trx\Services\AppException;
use Trx\Services\KpiPayrollService;
use Trx\Services\KpiService;
use Trx\Services\KpPdfService;
use Trx\Services\KpService;

/** КП, KPI, Аналитика, Команда. */
final class InsightsController
{
    public function __construct(
        private readonly KpService $kp = new KpService(),
        private readonly KpiService $kpi = new KpiService(),
        private readonly AnalyticsService $analytics = new AnalyticsService(),
        private readonly KpPdfService $kpPdf = new KpPdfService(),
        private readonly KpiPayrollService $payroll = new KpiPayrollService(),
    ) {
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function handle(string $action, Request $request, array $user, array $params = []): void
    {
        try {
            $id = (int) ($params['id'] ?? 0);
            [$data, $status] = match ($action) {
                'kp.list' => [$this->kp->list($request->query), 200],
                'kp.get' => [$this->kp->get($id), 200],
                'kp.create' => [$this->kp->create($user, $request->body), 201],
                'kp.update' => [$this->kp->update($id, $request->body), 200],
                'kp.company.get' => [$this->kpPdf->company(), 200],
                'kp.company.save' => [$this->kpPdf->saveCompany($user, $request->body), 200],
                'kpi.list' => [$this->kpi->list($user, $request->query['period'] ?? null), 200],
                'kpi.save' => [$this->kpi->save($user, $request->body), 200],
                'kpi.payroll' => [$this->payroll->report($user, $request->query['period'] ?? null), 200],
                'kpi.salaries' => [$this->payroll->salaries($user), 200],
                'kpi.salary.save' => [$this->payroll->saveSalary($user, $request->body), 200],
                'kpi.adjust' => [$this->payroll->adjust($user, $params['period'] ?? null, $request->body), 200],
                'kpi.approve' => [$this->payroll->approve($user, $params['period'] ?? null), 200],
                'kpi.reopen' => [$this->payroll->reopen($user, $params['period'] ?? null, $request->body), 200],
                'analytics' => [$this->analytics->tasks($request->query), 200],
                'team' => [$this->analytics->team(), 200],
                'team.profile' => [$this->analytics->profile($id), 200],
                default => throw new AppException('Не найдено', 404),
            };
            Response::json($data, $status);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }

    /** Streams the stored КП PDF. ?download=1 → attachment, otherwise inline preview. */
    public function kpPdf(Request $request, array $user, array $params): void
    {
        try {
            $file = $this->kp->pdfFile((int) ($params['id'] ?? 0));
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);

            return;
        }
        $download = ($request->query['download'] ?? '') === '1';
        $ascii = preg_replace('/[^\x20-\x7E]/', '_', $file['name']) ?: 'kp.pdf';
        header('Content-Type: application/pdf');
        header('Content-Length: ' . (string) filesize($file['path']));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header(sprintf(
            "Content-Disposition: %s; filename=\"%s\"; filename*=UTF-8''%s",
            $download ? 'attachment' : 'inline',
            str_replace('"', '', $ascii),
            rawurlencode($file['name'])
        ));
        readfile($file['path']);
    }

    /** KPI payroll month as .xlsx (owner only). */
    public function kpiExport(Request $request, array $user, array $params): void
    {
        try {
            $file = $this->payroll->export($user, $params['period'] ?? null);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);

            return;
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Length: ' . (string) strlen($file['body']));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Disposition: attachment; filename="' . $file['name'] . '"');
        echo $file['body'];
    }
}
