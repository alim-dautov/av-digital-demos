<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * QR token "{display_id}.{epoch}.{sig}", sig = first 128 bits of HMAC-SHA256 (base64url).
 * The secret never leaves the server; the token carries no credentials.
 */
final class AttendanceToken
{
    private static function sig(int $displayId, int $epoch, string $secret): string
    {
        $raw = hash_hmac('sha256', "demo-att|v1|{$displayId}|{$epoch}", $secret, true);

        return substr(rtrim(strtr(base64_encode($raw), '+/', '-_'), '='), 0, 22);
    }

    public static function make(int $displayId, int $epoch, string $secret): string
    {
        return $displayId . '.' . $epoch . '.' . self::sig($displayId, $epoch, $secret);
    }

    /**
     * Accepts the bare token or the QR URL (…?t=token).
     *
     * @return array{display_id:int,epoch:int,sig:string}|null
     */
    public static function parse(string $token): ?array
    {
        $token = trim($token);
        if (str_contains($token, 't=')) {
            $query = (string) parse_url($token, PHP_URL_QUERY);
            parse_str($query, $q);
            $token = is_string($q['t'] ?? null) ? $q['t'] : '';
        }
        if (!preg_match('/^(\d{1,10})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/', $token, $m)) {
            return null;
        }

        return ['display_id' => (int) $m[1], 'epoch' => (int) $m[2], 'sig' => $m[3]];
    }

    /** @param array{display_id:int,epoch:int,sig:string} $p */
    public static function valid(array $p, string $secret): bool
    {
        return hash_equals(self::sig((int) $p['display_id'], (int) $p['epoch'], $secret), (string) $p['sig']);
    }
}
