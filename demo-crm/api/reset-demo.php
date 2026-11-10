<?php
/**
 * Демо: сброс данных. Запуск только из командной строки (планировщик задач Plesk):
 *   php /путь/к/сайту/api/reset-demo.php
 * Удаляет data/store.json; при следующем открытии приложение заново заливает выдуманные данные.
 */
if (PHP_SAPI !== 'cli') {
  http_response_code(403);
  exit;
}
$file = dirname(__DIR__) . '/data/store.json';
if (is_file($file)) {
  unlink($file);
}
echo "demo store reset\n";
