<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Proof a task needs before it can go «на проверку» or be closed.
 * Files count from the task itself and from its comments; a photo is any image file.
 */
final class TaskProof
{
    /**
     * @param array{requires_file?:mixed,requires_photo?:mixed,requires_checklist?:mixed} $rules
     * @param list<string> $mimes every file attached to the task or its comments
     * @param array{total:int,done:int} $checklist
     * @return list<string> what is still missing, empty when the task may be submitted
     */
    public static function missing(array $rules, array $mimes, array $checklist): array
    {
        $out = [];
        if (!empty($rules['requires_file']) && $mimes === []) {
            $out[] = 'прикрепите файл';
        }
        if (!empty($rules['requires_photo']) && array_filter($mimes, static fn (string $m): bool => str_starts_with(strtolower($m), 'image/')) === []) {
            $out[] = 'прикрепите фото';
        }
        if (!empty($rules['requires_checklist']) && ($checklist['total'] === 0 || $checklist['done'] < $checklist['total'])) {
            $out[] = 'отметьте все пункты чеклиста';
        }

        return $out;
    }

    /** Message for the API error. */
    public static function message(array $missing): string
    {
        return 'Нужно подтверждение: ' . implode(', ', $missing);
    }

    /**
     * Late when the due time passed before the task was handed in (or is still open).
     * Handing in on time counts even if the reviewer accepts later.
     */
    public static function isOverdue(?string $dueAt, string $status, ?string $submittedAt, ?string $completedAt, \DateTimeImmutable $now): bool
    {
        if ($dueAt === null || $dueAt === '' || $status === 'cancelled') {
            return false;
        }
        $due = new \DateTimeImmutable($dueAt, $now->getTimezone());
        $handedIn = $submittedAt ?: $completedAt;
        if ($handedIn) {
            return new \DateTimeImmutable($handedIn, $now->getTimezone()) > $due;
        }

        return $status !== 'done' && $now > $due;
    }
}
