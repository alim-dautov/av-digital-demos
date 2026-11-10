/**
 * Springs follow Apple's damping/response model, mapped onto motion's
 * `bounce` (0 = damping 1.0) and `duration` (≈ response, in seconds).
 */
export const SPRING = { type: "spring", bounce: 0, duration: 0.4 } as const;

export const SPRING_SNAPPY = { type: "spring", bounce: 0, duration: 0.3 } as const;

/** Only after a gesture that carried momentum (drag release, flick). */
export const SPRING_SHEET = { type: "spring", bounce: 0.15, duration: 0.3 } as const;

export const FADE = { duration: 0.15, ease: "easeOut" } as const;

/** Distance a flick would travel under scroll-like deceleration. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * CSS approximation of a spring (damping ~0.85) for places that only accept
 * an easing string, e.g. dnd-kit's drop animation.
 */
export const SPRING_EASING_CSS =
  "linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.095 24%, 1.104 25.3%, 1.1 27.3%, 1.072 31.1%, 0.969 41.2%, 0.957 44.3%, 0.96 47.3%, 1.003 58.3%, 1.013 63.8%, 1.004 77.4%, 0.998 88.8%, 1)";
