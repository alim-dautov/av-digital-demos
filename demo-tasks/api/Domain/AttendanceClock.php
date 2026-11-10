<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Attendance time rules: 6-second QR epochs from server time, storage in UTC,
 * people-facing dates in the working zone Asia/Qyzylorda (UTC+5).
 */
final class AttendanceClock
{
    public const EPOCH_SECONDS = 6;
    public const TZ = 'Asia/Qyzylorda';

    public static function epoch(int $unix): int
    {
        return intdiv($unix, self::EPOCH_SECONDS);
    }

    /** Milliseconds until the next epoch starts. */
    public static function msLeft(float $now): int
    {
        $next = (self::epoch((int) floor($now)) + 1) * self::EPOCH_SECONDS;

        return max(0, (int) round(($next - $now) * 1000));
    }

    public static function utc(int $unix): string
    {
        return gmdate('Y-m-d H:i:s', $unix);
    }

    private static function at(string $utc): \DateTimeImmutable
    {
        return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone(self::TZ));
    }

    /** Working date (local) of a UTC timestamp. */
    public static function workDate(string $utc): string
    {
        return self::at($utc)->format('Y-m-d');
    }

    public static function local(string $utc): string
    {
        return self::at($utc)->format('Y-m-d H:i:s');
    }

    public static function localToUtc(string $local): string
    {
        return (new \DateTimeImmutable($local, new \DateTimeZone(self::TZ)))
            ->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** Seconds since epoch of a stored UTC value. */
    public static function unix(string $utc): int
    {
        return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->getTimestamp();
    }
}
