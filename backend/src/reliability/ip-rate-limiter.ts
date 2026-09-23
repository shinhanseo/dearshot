import type { RequestHandler } from "express";
import { ApiError } from "../http/api-error.js";

type Counter = { count: number; resetsAtMillis: number };

export function createIpRateLimiter(options: {
  scope: string;
  limit: number;
  windowMillis?: number;
  maxEntries?: number;
  clock?: () => number;
}): RequestHandler {
  const windowMillis = options.windowMillis ?? 60_000;
  const maxEntries = options.maxEntries ?? 10_000;
  const clock = options.clock ?? Date.now;
  const counters = new Map<string, Counter>();

  const removeExpired = (now: number) => {
    for (const [storedKey, stored] of counters) {
      if (stored.resetsAtMillis <= now) counters.delete(storedKey);
    }
  };

  return (request, _response, next) => {
    const now = clock();
    const key = `${options.scope}:${request.ip ?? request.socket.remoteAddress ?? "unknown"}`;
    let counter = counters.get(key);
    if (!counter || counter.resetsAtMillis <= now) {
      if (!counter && counters.size >= maxEntries) removeExpired(now);
      if (!counter && counters.size >= maxEntries) {
        let earliestReset = now + windowMillis;
        for (const stored of counters.values()) {
          earliestReset = Math.min(earliestReset, stored.resetsAtMillis);
        }
        next(
          new ApiError({
            statusCode: 429,
            code: "RATE_LIMITED",
            message: "Too many requests",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((earliestReset - now) / 1_000),
            ),
          }),
        );
        return;
      }
      counter = { count: 0, resetsAtMillis: now + windowMillis };
      counters.set(key, counter);
    }
    counter.count += 1;
    if (counter.count > options.limit) {
      next(
        new ApiError({
          statusCode: 429,
          code: "RATE_LIMITED",
          message: "Too many requests",
          retryAfterSeconds: Math.max(1, Math.ceil((counter.resetsAtMillis - now) / 1_000)),
        }),
      );
      return;
    }

    next();
  };
}
