<?php

declare(strict_types=1);

namespace Trx\Http;

final class Router
{
    /** @var array<int, array{methods: list<string>, pattern: string, handler: callable}> */
    private array $routes = [];

    /** @param list<string>|string $methods */
    public function add(array|string $methods, string $pattern, callable $handler): void
    {
        $methods = is_array($methods) ? $methods : [$methods];
        $this->routes[] = [
            'methods' => array_map('strtoupper', $methods),
            'pattern' => $pattern,
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): void
    {
        foreach ($this->routes as $route) {
            if (!in_array($request->method, $route['methods'], true)) {
                continue;
            }
            $regex = '#^' . preg_replace('#\{([a-zA-Z_]+)\}#', '(?P<$1>[^/]+)', $route['pattern']) . '$#';
            if (!preg_match($regex, $request->path, $matches)) {
                continue;
            }
            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
            ($route['handler'])($request, $params);

            return;
        }

        Response::error('Маршрут не найден', 404);
    }
}
