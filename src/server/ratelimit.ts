import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { coachLimits } from "@/config/coach";
import { env } from "@/env";
import { RateLimitedError } from "@/lib/errors";
import { log } from "@/lib/log";

export interface RateLimitDecision {
  success: boolean;
  /** Unix ms when the window resets. */
  reset: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitDecision>;
}

export type RateLimitBucket = "chat" | "api";

export interface RateLimitPolicy {
  /** Check every limiter for `bucket`; throws RateLimitedError when any is exhausted. */
  enforce(bucket: RateLimitBucket, userId: string): Promise<void>;
}

type Scheduler = (task: () => Promise<unknown>) => void;

function upstashLimiter(
  redis: Redis,
  prefix: string,
  limiter: ConstructorParameters<typeof Ratelimit>[0]["limiter"],
  schedule: Scheduler,
): RateLimiter {
  const rl = new Ratelimit({
    redis,
    limiter,
    prefix,
    analytics: false,
    // Fail open after 1.5 s: a Redis blip must not take chat down.
    timeout: 1500,
    ephemeralCache: new Map(),
  });
  return {
    async limit(key) {
      const res = await rl.limit(key);
      schedule(() => res.pending);
      return { success: res.success, reset: res.reset };
    },
  };
}

/** Pure policy over injected limiters — unit-testable without Redis. */
export function createRateLimitPolicy(
  limiters: Record<RateLimitBucket, readonly RateLimiter[]>,
  now: () => number = Date.now,
): RateLimitPolicy {
  return {
    async enforce(bucket, userId) {
      const results = await Promise.all(
        limiters[bucket].map(async (limiter) => {
          try {
            return await limiter.limit(userId);
          } catch (error) {
            log.warn("ratelimit.unavailable", { bucket, error });
            return { success: true, reset: now() } satisfies RateLimitDecision;
          }
        }),
      );
      const blocked = results.filter((r) => !r.success);
      if (blocked.length > 0) {
        const resetAt = Math.max(...blocked.map((r) => r.reset));
        throw new RateLimitedError((resetAt - now()) / 1000);
      }
    },
  };
}

let policy: RateLimitPolicy | undefined;

export function getRateLimitPolicy(schedule: Scheduler): RateLimitPolicy {
  if (policy) return policy;
  const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  const ns = `${env.MEMWAL_NAMESPACE_PREFIX}:rl`;
  policy = createRateLimitPolicy({
    chat: [
      upstashLimiter(
        redis,
        `${ns}:chat:min`,
        Ratelimit.slidingWindow(coachLimits.chatPerMinute, "1 m"),
        schedule,
      ),
      upstashLimiter(
        redis,
        `${ns}:chat:day`,
        Ratelimit.fixedWindow(coachLimits.chatPerDay, "1 d"),
        schedule,
      ),
    ],
    api: [
      upstashLimiter(
        redis,
        `${ns}:api:min`,
        Ratelimit.slidingWindow(coachLimits.apiPerMinute, "1 m"),
        schedule,
      ),
    ],
  });
  return policy;
}
