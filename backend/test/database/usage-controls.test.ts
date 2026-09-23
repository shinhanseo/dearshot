import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import type { DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { dailyUsage, idempotencyRecords } from "../../src/db/schema/analytics.js";
import { users } from "../../src/db/schema/identity.js";
import { ApiError } from "../../src/http/api-error.js";
import {
  hashIdempotentRequest,
  IdempotencyService,
} from "../../src/reliability/idempotency-service.js";
import { UsageLimitService } from "../../src/reliability/usage-limit-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");

const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 16,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const limits = {
  timezone: "UTC" as const,
  guest: { sceneAnalysesPerDay: 2, photoFeedbacksPerDay: 3 },
  member: { sceneAnalysesPerDay: 5, photoFeedbacksPerDay: 6 },
};
let connection: DatabaseConnection;

async function createUser(accountType: "GUEST" | "MEMBER" = "GUEST") {
  const id = randomUUID();
  await connection.db.insert(users).values({ id, accountType });
  return { sub: id, principalType: accountType } as const;
}

describe("usage and idempotency controls", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, pino({ level: "silent" }));
    await verifyDatabaseConnection(connection.pool);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table idempotency_records, daily_usage, oauth_nonce_uses, auth_identities,
      refresh_sessions, user_preferences, users restart identity cascade
    `);
  });

  after(async () => closeDatabaseConnection(connection.pool));

  it("enforces guest limits atomically and returns the UTC reset boundary", async () => {
    const principal = await createUser();
    const clock = () => new Date("2026-09-23T23:59:30.000Z");
    const service = new UsageLimitService(connection.db, limits, clock);

    assert.equal((await service.consume(principal, "SCENE_ANALYSIS")).remaining, 1);
    assert.equal((await service.consume(principal, "SCENE_ANALYSIS")).remaining, 0);
    await assert.rejects(
      () => service.consume(principal, "SCENE_ANALYSIS"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.statusCode, 429);
        assert.equal(error.code, "RATE_LIMITED");
        assert.equal(error.retryAfterSeconds, 30);
        assert.equal(error.details?.resetsAt, "2026-09-24T00:00:00.000Z");
        return true;
      },
    );
  });

  it("allows only the configured number of concurrent requests", async () => {
    const principal = await createUser("MEMBER");
    const service = new UsageLimitService(connection.db, limits, () => new Date("2026-09-23T12:00:00Z"));
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => service.consume(principal, "SCENE_ANALYSIS")),
    );

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
    assert.equal(results.filter((result) => result.status === "rejected").length, 7);
    const [stored] = await connection.db
      .select()
      .from(dailyUsage)
      .where(eq(dailyUsage.userId, principal.sub));
    assert.equal(stored.sceneAnalysisCount, 5);
  });

  it("replays the same idempotent result, isolates principals, and rejects a changed request", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();
    const service = new IdempotencyService(connection.db);
    const key = randomUUID();
    const requestHash = hashIdempotentRequest(["SCENE_ANALYSIS", "image-sha"]);
    let executions = 0;
    const handler = async () => {
      executions += 1;
      return { statusCode: 201, body: { analysisId: randomUUID() } };
    };

    const first = await service.execute(
      { userId: firstUser.sub, scope: "POST /api/v1/scene-analyses", key, requestHash },
      handler,
    );
    const replay = await service.execute(
      { userId: firstUser.sub, scope: "POST /api/v1/scene-analyses", key, requestHash },
      handler,
    );
    const otherPrincipal = await service.execute(
      { userId: secondUser.sub, scope: "POST /api/v1/scene-analyses", key, requestHash },
      handler,
    );

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, first.body);
    assert.equal(otherPrincipal.replayed, false);
    assert.equal(executions, 2);
    await assert.rejects(
      () =>
        service.execute(
          {
            userId: firstUser.sub,
            scope: "POST /api/v1/scene-analyses",
            key,
            requestHash: hashIdempotentRequest(["SCENE_ANALYSIS", "other-image"]),
          },
          handler,
        ),
      (error: unknown) => error instanceof ApiError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("executes one handler for concurrent requests with the same key", async () => {
    const principal = await createUser();
    const service = new IdempotencyService(connection.db);
    const key = randomUUID();
    const requestHash = hashIdempotentRequest(["PHOTO_FEEDBACK", "same-image"]);
    let executions = 0;
    const invoke = () =>
      service.execute(
        { userId: principal.sub, scope: "POST /api/v1/photo-feedbacks", key, requestHash },
        async () => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return { statusCode: 201, body: { feedbackId: randomUUID() } };
        },
      );

    const results = await Promise.all([invoke(), invoke(), invoke()]);
    assert.equal(executions, 1);
    assert.equal(results.filter((result) => result.replayed).length, 2);
    assert.equal(new Set(results.map((result) => result.body.feedbackId)).size, 1);
    const [count] = await connection.db
      .select({ value: sql<number>`count(*)::int` })
      .from(idempotencyRecords);
    assert.equal(count.value, 1);
  });
});
