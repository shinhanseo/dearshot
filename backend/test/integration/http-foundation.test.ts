import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import type { DestinationStream } from "pino";
import pino from "pino";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { getRequestContext, REQUEST_ID_HEADER } from "../../src/http/request-context.js";
import { errorHandler } from "../../src/http/error-handler.js";
import { createHttpLogger } from "../../src/http/http-logger.js";
import { requestContext } from "../../src/http/request-context.js";
import { createLogger } from "../../src/observability/logger.js";
import { ApiError } from "../../src/http/api-error.js";

const silentLogger = pino({ level: "silent" });

describe("HTTP foundation", () => {
  it("preserves a valid request ID through AsyncLocalStorage and the response", async () => {
    const suppliedRequestId = randomUUID();
    let contextualRequestId: string | undefined;
    const app = createApp({
      logger: silentLogger,
      checkDatabase: async () => {
        await Promise.resolve();
        contextualRequestId = getRequestContext()?.requestId;
      },
    });

    const response = await request(app).get("/health").set(REQUEST_ID_HEADER, suppliedRequestId);

    assert.equal(response.status, 200);
    assert.equal(response.headers["x-request-id"], suppliedRequestId);
    assert.equal(contextualRequestId, suppliedRequestId);
    assert.deepEqual(response.body, {
      status: "ok",
      service: "dearshot-api",
      database: "ready",
    });
  });

  it("keeps concurrent request contexts isolated across asynchronous work", async () => {
    const firstRequestId = randomUUID();
    const secondRequestId = randomUUID();
    const observed: Array<[string | undefined, string | undefined]> = [];
    const app = createApp({
      logger: silentLogger,
      checkDatabase: async () => {
        const beforeAwait = getRequestContext()?.requestId;
        await new Promise((resolve) => setTimeout(resolve, 5));
        observed.push([beforeAwait, getRequestContext()?.requestId]);
      },
    });

    const [first, second] = await Promise.all([
      request(app).get("/health").set(REQUEST_ID_HEADER, firstRequestId),
      request(app).get("/health").set(REQUEST_ID_HEADER, secondRequestId),
    ]);

    assert.equal(first.headers["x-request-id"], firstRequestId);
    assert.equal(second.headers["x-request-id"], secondRequestId);
    assert.deepEqual(
      new Set(observed.map(([before, after]) => `${before}:${after}`)),
      new Set([`${firstRequestId}:${firstRequestId}`, `${secondRequestId}:${secondRequestId}`]),
    );
  });

  it("returns the OpenAPI error shape for validation failures", async () => {
    const app = createApp({ logger: silentLogger, checkDatabase: async () => undefined });

    const response = await request(app).post("/api/v1/scene-analysis").send({ locale: "ko" });

    assert.equal(response.status, 400);
    assert.equal(response.body.requestId, response.headers["x-request-id"]);
    assert.equal(response.body.code, "INVALID_REQUEST");
    assert.equal(response.body.message, "Request body is invalid");
    assert.ok(response.body.details.fieldErrors.imageReference);
    assert.ok(response.body.details.fieldErrors.capturedAt);
  });

  it("redacts an internal database failure from the response", async () => {
    const app = createApp({
      logger: silentLogger,
      checkDatabase: async () => {
        throw new Error("postgresql://user:database-password@postgres/dearshot");
      },
    });

    const response = await request(app).get("/health");

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      requestId: response.headers["x-request-id"],
      code: "SERVICE_UNAVAILABLE",
      message: "Service is temporarily unavailable",
    });
    assert.doesNotMatch(JSON.stringify(response.body), /database-password/);
  });

  it("returns a stable 500 response without exposing an unknown exception", async () => {
    const app = express();
    app.use(requestContext);
    app.use(createHttpLogger(silentLogger));
    app.get("/boom", () => {
      throw new Error("internal-secret-that-must-not-leak");
    });
    app.use(errorHandler);

    const response = await request(app).get("/boom");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      requestId: response.headers["x-request-id"],
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
    assert.doesNotMatch(JSON.stringify(response.body), /internal-secret-that-must-not-leak/);
  });

  it("normalizes malformed JSON and missing routes", async () => {
    const app = createApp({ logger: silentLogger, checkDatabase: async () => undefined });

    const malformed = await request(app)
      .post("/api/v1/scene-analysis")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    const missing = await request(app).get("/does-not-exist");

    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.code, "INVALID_REQUEST");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "RESOURCE_NOT_FOUND");
    assert.equal(missing.body.requestId, missing.headers["x-request-id"]);
  });

  it("emits Retry-After for bounded rate errors", async () => {
    const app = express();
    app.use(requestContext);
    app.use(createHttpLogger(silentLogger));
    app.get("/limited", (_request, _response, next) => {
      next(
        new ApiError({
          statusCode: 429,
          code: "RATE_LIMITED",
          message: "Daily limit exceeded",
          retryAfterSeconds: 45,
        }),
      );
    });
    app.use(errorHandler);

    const response = await request(app).get("/limited");
    assert.equal(response.status, 429);
    assert.equal(response.headers["retry-after"], "45");
  });

  it("does not log authorization, cookies, request bodies, or query strings", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }) as DestinationStream;
    const logger = createLogger({ destination });
    const app = createApp({ logger, checkDatabase: async () => undefined });
    const requestId = randomUUID();

    await request(app)
      .post("/does-not-exist?access_token=query-secret")
      .set(REQUEST_ID_HEADER, requestId)
      .set("Authorization", "Bearer authorization-secret")
      .set("Cookie", "session=cookie-secret")
      .send({ refreshToken: "body-secret" });

    assert.doesNotMatch(
      output,
      /query-secret|authorization-secret|cookie-secret|body-secret|access_token/,
    );
    assert.match(output, /does-not-exist/);
    assert.match(output, new RegExp(requestId));
  });
});
