<?php

declare(strict_types=1);

namespace Trx\Auth;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Trx\Config;
use Trx\Database;

final class SessionService
{
    public function create(int $userId, string $ip, string $ua): array
    {
        $pdo = Database::pdo();
        $id = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(32));
        $hours = (int) Config::get('session.lifetime_hours', 12);
        $tz = new DateTimeZone((string) Config::get('app.timezone', 'Asia/Almaty'));
        $lifetime = $hours * 3600;
        $expires = (new DateTimeImmutable('now', $tz))->modify("+{$hours} hours")->format('Y-m-d H:i:s');
        // Only the QR screen role gets its own (longer) lifetime; it is revoked by deleting its sessions.
        $role = Database::pdo()->prepare('SELECT r.slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?');
        $role->execute([$userId]);
        if ($role->fetchColumn() === \Trx\Security\Policy::DISPLAY_ROLE) {
            $days = max(1, min(90, (int) Config::get('attendance.display_session_days', 30)));
            $expires = (new DateTimeImmutable('now', $tz))->modify("+{$days} days")->format('Y-m-d H:i:s');
            $lifetime = $days * 86400;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO sessions (id, user_id, csrf_token, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$id, $userId, $csrf, $ip, $ua, $expires]);

        // Cookie lives exactly as long as this session row (QR screens: their own lifetime).
        $this->setCookie($id, time() + $lifetime);

        return ['id' => $id, 'csrf_token' => $csrf, 'expires_at' => $expires];
    }

    public function destroy(?string $sessionId): void
    {
        if ($sessionId) {
            $stmt = Database::pdo()->prepare('DELETE FROM sessions WHERE id = ?');
            $stmt->execute([$sessionId]);
        }
        $this->clearCookie();
    }

    /** @return array<string, mixed>|null */
    public function resolve(?string $sessionId): ?array
    {
        if (!$sessionId) {
            return null;
        }
        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT s.*, u.email, u.username, u.name, u.initials, u.phone, u.must_change_password,
                    u.is_active, u.totp_enabled, u.department_id, u.see_all_tasks,
                    r.slug AS role_slug, r.name AS role_name
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             JOIN roles r ON r.id = u.role_id
             WHERE s.id = ? AND s.expires_at > NOW() AND u.is_active = 1
             LIMIT 1'
        );
        $stmt->execute([$sessionId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $pdo->prepare('UPDATE sessions SET last_seen_at = NOW() WHERE id = ?')->execute([$sessionId]);

        return \Trx\Security\Policy::normalizeRole($row);
    }

    public function cookieName(): string
    {
        return (string) Config::get('session.name', 'demo_session');
    }

    public function readCookie(): ?string
    {
        $name = $this->cookieName();

        return isset($_COOKIE[$name]) && is_string($_COOKIE[$name]) ? $_COOKIE[$name] : null;
    }

    private function setCookie(string $id, int $expiresAt): void
    {
        $secure = (bool) Config::get('app.secure_cookies', false);
        setcookie($this->cookieName(), $id, [
            'expires' => $expiresAt,
            'path' => (string) Config::get('session.cookie_path', '/'),
            'secure' => $secure,
            'httponly' => true,
            'samesite' => (string) Config::get('session.same_site', 'Lax'),
        ]);
    }

    private function clearCookie(): void
    {
        $secure = (bool) Config::get('app.secure_cookies', false);
        setcookie($this->cookieName(), '', [
            'expires' => time() - 3600,
            'path' => (string) Config::get('session.cookie_path', '/'),
            'secure' => $secure,
            'httponly' => true,
            'samesite' => (string) Config::get('session.same_site', 'Lax'),
        ]);
    }
}
