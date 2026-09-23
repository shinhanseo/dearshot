import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../src/http/api-error.js";
import { createIpRateLimiter } from "../../src/reliability/ip-rate-limiter.js";

describe("IP rate limiter", () => {
  it("acts as a bounded secondary limit and reports when to retry", () => {
    let now = 1_000;
    const middleware = createIpRateLimiter({
      scope: "scene-analysis",
      limit: 2,
      windowMillis: 60_000,
      clock: () => now,
    });
    const request = { ip: "203.0.113.10", socket: {} } as Request;
    const response = {} as Response;
    const errors: unknown[] = [];
    const next = ((error?: unknown) => errors.push(error)) as NextFunction;

    middleware(request, response, next);
    middleware(request, response, next);
    middleware(request, response, next);

    assert.equal(errors[0], undefined);
    assert.equal(errors[1], undefined);
    assert.ok(errors[2] instanceof ApiError);
    assert.equal((errors[2] as ApiError).statusCode, 429);
    assert.equal((errors[2] as ApiError).retryAfterSeconds, 60);

    now += 60_000;
    middleware(request, response, next);
    assert.equal(errors[3], undefined);
  });
});
