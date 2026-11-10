<?php

declare(strict_types=1);

namespace Trx\Domain;

final class BusinessCalendar
{
    public function __construct(
        private readonly string $open = '09:00',
        private readonly string $close = '18:00',
        /** @var list<int> */
        private readonly array $weekdays = [1, 2, 3, 4, 5],
        private readonly \DateTimeZone $tz = new \DateTimeZone('Asia/Almaty'),
    ) {
    }

    public function isOpen(\DateTimeImmutable $at): bool
    {
        $at = $at->setTimezone($this->tz);
        if (!in_array((int) $at->format('N'), $this->weekdays, true)) {
            return false;
        }
        $hm = $at->format('H:i');

        return $hm >= $this->open && $hm < $this->close;
    }

    public function nextOpen(\DateTimeImmutable $at): \DateTimeImmutable
    {
        $at = $at->setTimezone($this->tz);
        if ($this->isOpen($at)) {
            return $at;
        }
        $cursor = $at;
        for ($i = 0; $i < 21; $i++) {
            [$h, $m] = array_map('intval', explode(':', $this->open));
            $start = $cursor->setTime($h, $m, 0);
            if ($start <= $cursor) {
                $cursor = $cursor->modify('+1 day')->setTime(0, 0, 0);
                continue;
            }
            if (in_array((int) $start->format('N'), $this->weekdays, true)) {
                return $start;
            }
            $cursor = $cursor->modify('+1 day')->setTime(0, 0, 0);
        }

        return $at;
    }

    /** @return array{calendar:int,business:int} */
    public function minutesBetween(\DateTimeImmutable $from, \DateTimeImmutable $to): array
    {
        $from = $from->setTimezone($this->tz);
        $to = $to->setTimezone($this->tz);
        if ($to <= $from) {
            return ['calendar' => 0, 'business' => 0];
        }
        $calendar = (int) floor(($to->getTimestamp() - $from->getTimestamp()) / 60);
        $business = 0;
        $cursor = $from;
        for ($guard = 0; $cursor < $to && $guard < 40; $guard++) {
            if (!in_array((int) $cursor->format('N'), $this->weekdays, true)) {
                $cursor = $cursor->modify('+1 day')->setTime(0, 0, 0);
                continue;
            }
            [$oh, $om] = array_map('intval', explode(':', $this->open));
            [$ch, $cm] = array_map('intval', explode(':', $this->close));
            $open = $cursor->setTime($oh, $om, 0);
            $close = $cursor->setTime($ch, $cm, 0);
            $segStart = $cursor > $open ? $cursor : $open;
            $segEnd = $to < $close ? $to : $close;
            if ($segEnd > $segStart) {
                $business += (int) floor(($segEnd->getTimestamp() - $segStart->getTimestamp()) / 60);
            }
            $cursor = $cursor->modify('+1 day')->setTime(0, 0, 0);
        }

        return ['calendar' => $calendar, 'business' => $business];
    }
}
