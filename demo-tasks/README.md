# Demo CRM (демо-версия)

Демо-копия CRM с вымышленными данными. Внешние интеграции и загрузка файлов отключены (`app.demo_mode`).

## Развёртывание (Plesk, PHP 8.1+, MySQL/MariaDB)

1. Создать поддомен и пустую MySQL-базу с пользователем.
2. Загрузить содержимое проекта вне `public_html`; корень сайта поддомена = `public_html`.
3. `cp config.example.php config.php` и заполнить `url`, `db.name/user/pass`. `demo_mode` оставить `true`.
4. Первый запрос к API сам применит миграции; либо `php scripts/migrate.php`.
5. Тестовые данные: `php scripts/seed_crm.php && php scripts/seed_workdata.php`.
6. Ночной сброс (Scheduled Tasks, раз в сутки): `php /путь/к/проекту/scripts/reset_demo.php`.

Вход: логины aidar, daniyar, timur, erlan, arman, dinara; пароль `demo12345`.
(Скрипт сброса возвращает этот пароль всем учёткам.)
