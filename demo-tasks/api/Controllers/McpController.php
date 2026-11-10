<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Mcp\McpServer;

final class McpController
{
    public function __construct(
        private readonly McpServer $server = new McpServer(),
    ) {
    }

    public function handle(Request $request): void
    {
        $result = $this->server->respond($request);
        http_response_code($result['status']);
        foreach ($result['headers'] as $name => $value) {
            header($name . ': ' . $value);
        }
        if ($result['body'] !== null && $result['body'] !== '') {
            echo $result['body'];
        }
    }
}
