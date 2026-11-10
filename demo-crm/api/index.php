<?php
/**
 * Demo Agency shared store API for hoster.kz (PHP 7.4+).
 * Actions: login | data | mutate | reset
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
  json_out(500, ['error' => 'Создайте api/config.php из config.example.php']);
}

$config = require $configFile;
$collections = ['users', 'projects', 'tasks', 'meetings', 'deals', 'activities', 'files'];

$action = isset($_GET['action']) ? $_GET['action'] : 'data';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'login' && $method === 'POST') {
  handle_login($config);
}

$user = require_user($config);

if ($action === 'data' && $method === 'GET') {
  $data = read_store();
  if ($data === null) {
    json_out(200, ['empty' => true]);
  }
  json_out(200, $data);
}

if ($action === 'mutate' && $method === 'POST') {
  $body = json_body();
  $collection = isset($body['collection']) ? $body['collection'] : '';
  $op = isset($body['op']) ? $body['op'] : '';
  if (!in_array($collection, $collections, true) || !in_array($op, ['upsert', 'delete', 'replaceAll'], true)) {
    json_out(400, ['error' => 'Некорректная операция']);
  }

  $saved = with_lock(function () use ($collection, $op, $body) {
    $data = read_store();
    if ($data === null) {
      json_out(409, ['error' => 'empty', 'empty' => true]);
    }
    if ($op === 'replaceAll') {
      if (!isset($body['items']) || !is_array($body['items'])) {
        json_out(400, ['error' => 'Нет items']);
      }
      $data[$collection] = $body['items'];
    } elseif ($op === 'delete') {
      $id = isset($body['id']) ? $body['id'] : '';
      $list = isset($data[$collection]) && is_array($data[$collection]) ? $data[$collection] : [];
      $next = [];
      foreach ($list as $row) {
        if (!isset($row['id']) || $row['id'] !== $id) {
          $next[] = $row;
        }
      }
      $data[$collection] = $next;
    } else {
      $item = isset($body['item']) && is_array($body['item']) ? $body['item'] : null;
      if (!$item || empty($item['id'])) {
        json_out(400, ['error' => 'Нет item']);
      }
      $list = isset($data[$collection]) && is_array($data[$collection]) ? $data[$collection] : [];
      $found = false;
      foreach ($list as $i => $row) {
        if (isset($row['id']) && $row['id'] === $item['id']) {
          $list[$i] = $item;
          $found = true;
          break;
        }
      }
      if (!$found) {
        array_unshift($list, $item);
      }
      if ($collection === 'activities') {
        $list = array_slice($list, 0, 100);
      }
      $data[$collection] = $list;
    }
    $data['version'] = intval(isset($data['version']) ? $data['version'] : 0) + 1;
    write_store($data);
    return $data;
  });
  json_out(200, $saved);
}

if ($action === 'reset' && $method === 'POST') {
  $body = json_body();
  if (!isset($body['data']) || !is_array($body['data'])) {
    json_out(400, ['error' => 'Нет data']);
  }
  $force = !empty($body['force']);
  $saved = with_lock(function () use ($body, $config, $force) {
    $existing = read_store();
    if ($existing !== null && !$force) {
      return $existing;
    }
    $data = $body['data'];
    $data['version'] = $existing ? intval(isset($existing['version']) ? $existing['version'] : 0) + 1 : 1;
    if (!isset($data['users']) || !is_array($data['users']) || count($data['users']) === 0) {
      $data['users'] = public_users($config);
    }
    write_store($data);
    return $data;
  });
  json_out(200, $saved);
}

json_out(404, ['error' => 'Unknown action']);

function json_out($code, $payload)
{
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

function json_body()
{
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function store_dir()
{
  return dirname(__DIR__) . '/data';
}

function store_path()
{
  return store_dir() . '/store.json';
}

function read_store()
{
  $file = store_path();
  if (!is_file($file)) {
    return null;
  }
  $raw = file_get_contents($file);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : null;
}

function write_store($data)
{
  $dir = store_dir();
  if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    json_out(500, ['error' => 'Не удалось создать папку data']);
  }
  $file = store_path();
  $tmp = $file . '.tmp';
  $json = json_encode($data, JSON_UNESCAPED_UNICODE);
  if (file_put_contents($tmp, $json, LOCK_EX) === false) {
    json_out(500, ['error' => 'Не удалось записать данные. Проверьте права на папку data']);
  }
  if (!rename($tmp, $file)) {
    json_out(500, ['error' => 'Не удалось сохранить данные']);
  }
}

function with_lock($fn)
{
  $dir = store_dir();
  if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    json_out(500, ['error' => 'Не удалось создать папку data']);
  }
  $lockFile = $dir . '/store.lock';
  $fp = fopen($lockFile, 'c');
  if (!$fp) {
    json_out(500, ['error' => 'Не удалось взять блокировку']);
  }
  flock($fp, LOCK_EX);
  try {
    return $fn();
  } finally {
    flock($fp, LOCK_UN);
    fclose($fp);
  }
}

function public_user($row)
{
  return [
    'id' => $row['id'],
    'name' => $row['name'],
    'email' => $row['email'],
    'role' => $row['role'],
    'roleLabel' => $row['roleLabel'],
    'avatarColor' => $row['avatarColor'],
    'initials' => $row['initials'],
    'workload' => intval($row['workload']),
  ];
}

function public_users($config)
{
  $out = [];
  foreach ($config['users'] as $row) {
    $out[] = public_user($row);
  }
  return $out;
}

function b64url_encode($raw)
{
  return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function b64url_decode($value)
{
  $pad = strlen($value) % 4;
  if ($pad) {
    $value .= str_repeat('=', 4 - $pad);
  }
  return base64_decode(strtr($value, '-_', '+/'));
}

function make_token($config, $userId)
{
  $exp = time() + intval($config['token_ttl']);
  $payload = b64url_encode(json_encode(['uid' => $userId, 'exp' => $exp]));
  $sig = hash_hmac('sha256', $payload, $config['secret']);
  return $payload . '.' . $sig;
}

function parse_token($config, $token)
{
  $parts = explode('.', $token);
  if (count($parts) !== 2) {
    return null;
  }
  list($payload, $sig) = $parts;
  $check = hash_hmac('sha256', $payload, $config['secret']);
  if (!hash_equals($check, $sig)) {
    return null;
  }
  $data = json_decode(b64url_decode($payload), true);
  if (!is_array($data) || empty($data['uid']) || empty($data['exp']) || $data['exp'] < time()) {
    return null;
  }
  foreach ($config['users'] as $row) {
    if ($row['id'] === $data['uid']) {
      return public_user($row);
    }
  }
  return null;
}

function bearer_token()
{
  $header = '';
  if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $header = $_SERVER['HTTP_AUTHORIZATION'];
  } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
  } elseif (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    if (isset($headers['Authorization'])) {
      $header = $headers['Authorization'];
    } elseif (isset($headers['authorization'])) {
      $header = $headers['authorization'];
    }
  }
  if (preg_match('/Bearer\s+(\S+)/', $header, $m)) {
    return $m[1];
  }
  return '';
}

function require_user($config)
{
  $token = bearer_token();
  $user = $token ? parse_token($config, $token) : null;
  if (!$user) {
    json_out(401, ['error' => 'Нужна авторизация']);
  }
  return $user;
}

function handle_login($config)
{
  $body = json_body();
  $email = isset($body['email']) ? strtolower(trim($body['email'])) : '';
  $password = isset($body['password']) ? $body['password'] : '';
  foreach ($config['users'] as $row) {
    if (strtolower($row['email']) === $email && hash_equals((string) $row['password'], (string) $password)) {
      $user = public_user($row);
      json_out(200, [
        'token' => make_token($config, $user['id']),
        'user' => $user,
        'expiresAt' => gmdate('c', time() + intval($config['token_ttl'])),
      ]);
    }
  }
  json_out(401, ['error' => 'Неверный email или пароль']);
}
