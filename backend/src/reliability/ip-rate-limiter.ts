import type { RequestHandler } from "express";
import { ApiError } from "../http/api-error.js";

type Counter = { count: number; resetsAtMillis: number };

export function createIpRateLimiter(options: {
  scope: string;
  limit: number;
  windowMillis?: number;
  clock?: () => number;
}): RequestHandler {
  const windowMillis = options.windowMillis ?? 60_000;
  const clock = options.clock ?? Date.now;
  const counters = new Map<string, Counter>();

  return (request, _response, next) => {
    const now = clock();
    const key = `${options.scope}:${request.ip ?? request.socket.remoteAddress ?? "unknown"}`;
    let counter = counters.get(key);
    if (!counter || counter.resetsAtMillis <= now) {
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

    if (counters.size > 10_000) {
      for (const [storedKey, stored] of counters) {
        if (stored.resetsAtMillis <= now) counters.delete(storedKey);
      }
    }
    next();
  };
}
