<?php
/**
 * Скопируйте этот файл в config.php и смените secret и пароли
 * перед выкладкой на hoster.kz.
 *
 * cp config.example.php config.php
 */
return [
  'secret' => 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',
  'token_ttl' => 60 * 60 * 24 * 14,
  'users' => [
    [
      'id' => 'u1',
      'name' => 'Айгерим',
      'email' => 'aigerim@example.com',
      'password' => 'demo',
      'role' => 'manager',
      'roleLabel' => 'Руководитель',
      'avatarColor' => '#4F46E5',
      'initials' => 'АЙ',
      'workload' => 72,
    ],
    [
      'id' => 'u2',
      'name' => 'Тимур',
      'email' => 'timur@example.com',
      'password' => 'demo',
      'role' => 'developer',
      'roleLabel' => 'Разработчик',
      'avatarColor' => '#0EA5E9',
      'initials' => 'ТИ',
      'workload' => 80,
    ],
    [
      'id' => 'u3',
      'name' => 'Олег',
      'email' => 'oleg@example.com',
      'password' => 'demo',
      'role' => 'designer',
      'roleLabel' => 'Дизайнер',
      'avatarColor' => '#10B981',
      'initials' => 'ОЛ',
      'workload' => 40,
    ],
    [
      'id' => 'u4',
      'name' => 'Динара',
      'email' => 'dinara@example.com',
      'password' => 'demo',
      'role' => 'sales',
      'roleLabel' => 'Продажи',
      'avatarColor' => '#F59E0B',
      'initials' => 'ДИ',
      'workload' => 90,
    ],
    [
      'id' => 'u5',
      'name' => 'Ерлан',
      'email' => 'erlan@example.com',
      'password' => 'demo',
      'role' => 'pm',
      'roleLabel' => 'PM',
      'avatarColor' => '#8B5CF6',
      'initials' => 'ЕР',
      'workload' => 60,
    ],
  ],
];
