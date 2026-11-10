type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

/**
 * In-memory sliding window. Работает в пределах одного процесса Node,
 * для нескольких инстансов нужен общий стор (Redis).
 */
export function createRateLimiter(limit: number, windowMs: number) {
  function recent(key: string, now: number) {
    const bucket = buckets.get(key);
    if (!bucket) return [];
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    return bucket.hits;
  }

  return {
    /** Сколько секунд ждать, если лимит исчерпан; иначе 0. */
    retryAfter(keys: string[]): number {
      const now = Date.now();
      sweep(now, windowMs);
      let wait = 0;
      for (const key of keys) {
        const hits = recent(key, now);
        if (hits.length >= limit) {
          wait = Math.max(wait, Math.ceil((hits[0] + windowMs - now) / 1000));
        }
      }
      return wait;
    },
    hit(keys: string[]) {
      const now = Date.now();
      for (const key of keys) {
        const bucket = buckets.get(key) ?? { hits: [] };
        bucket.hits.push(now);
        buckets.set(key, bucket);
      }
    },
    reset(keys: string[]) {
      for (const key of keys) buckets.delete(key);
    },
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
