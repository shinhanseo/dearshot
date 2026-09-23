import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { TokenService } from "../../src/auth/token-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { appEvents } from "../../src/db/schema/analytics.js";
import { refreshSessions, users } from "../../src/db/schema/identity.js";
import { AppEventService } from "../../src/product-events/app-event-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");

const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 8,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const authConfig: AuthConfig = {
  accessTokenSecret: "event-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-event-test",
  audience: "dearshot-android-event-test",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};
const now = new Date();
const logger = pino({ level: "silent" });
let connection: DatabaseConnection;
let tokenService: TokenService;

async function createPrincipal(accountType: "GUEST" | "MEMBER" = "GUEST") {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await connection.db.insert(users).values({ id: userId, accountType });
  await connection.db.insert(refreshSessions).values({
    id: sessionId,
    userId,
    installationId: randomUUID(),
    tokenHash: randomBytes(32).toString("hex"),
    tokenFamilyId: randomUUID(),
    expiresAt: new Date(now.getTime() + 3_600_000),
  });
  const access = await tokenService.issueAccessToken({
    sub: userId,
    sid: sessionId,
    principalType: accountType,
    role: "USER",
  });
  return { userId, sessionId, token: access.token };
}

function eventApp() {
  const service = new AppEventService(
    connection.db,
    { retentionDays: 90, maximumPastAgeDays: 7, maximumFutureSkewSeconds: 300 },
    () => now,
  );
  return createApp({
    logger,
    checkDatabase: () => verifyDatabaseConnection(connection.pool),
    productEvents: { service, tokenService },
  });
}

function batch(events: unknown[]) {
  return {
    sessionId: randomUUID(),
    appVersion: "1.2.0",
    osVersion: "15",
    locale: "ko-KR",
    events,
  };
}

describe("product event collection", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    await verifyDatabaseConnection(connection.pool);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table app_events, idempotency_records, daily_usage, oauth_nonce_uses,
      auth_identities, refresh_sessions, user_preferences, users restart identity cascade
    `);
  });

  after(async () => closeDatabaseConnection(connection.pool));

  it("stores a validated guest funnel batch using the token actor and request ID", async () => {
    const principal = await createPrincipal();
    const analysisId = randomUUID();
    const response = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(
        batch([
          {
            eventId: randomUUID(),
            occurredAt: new Date(now.getTime() - 2_000).toISOString(),
            eventName: "scene_analysis_requested",
            properties: { source: "camera" },
          },
          {
            eventId: randomUUID(),
            occurredAt: new Date(now.getTime() - 1_000).toISOString(),
            eventName: "scene_analysis_completed",
            properties: { analysisId, durationMs: 1_200 },
          },
          {
            eventId: randomUUID(),
            occurredAt: now.toISOString(),
            eventName: "template_selected",
            properties: { templateId: "beach-breeze", templateVersion: 1, sceneKey: "beach" },
          },
        ]),
      );

    assert.equal(response.status, 202, JSON.stringify(response.body));
    assert.deepEqual(response.body, { accepted: 3, duplicates: 0 });
    const stored = await connection.db
      .select()
      .from(appEvents)
      .where(eq(appEvents.actorId, principal.userId));
    assert.equal(stored.length, 3);
    assert.ok(stored.every((event) => event.actorType === "GUEST"));
    assert.ok(stored.every((event) => event.requestId === response.headers["x-request-id"]));
    assert.ok(
      stored.every(
        (event) => event.expiresAt.getTime() === now.getTime() + 90 * 86_400_000,
      ),
    );
    const requested = stored.find(
      (event) => event.eventName === "scene_analysis_requested",
    );
    assert.deepEqual(requested?.properties, { source: "camera" });
  });

  it("deduplicates retries per actor while allowing the same event ID for another actor", async () => {
    const first = await createPrincipal();
    const second = await createPrincipal("MEMBER");
    const eventId = randomUUID();
    const payload = batch([
      {
        eventId,
        occurredAt: now.toISOString(),
        eventName: "photo_saved",
        properties: { templateId: "beach-breeze", templateVersion: 1, hadFeedback: true },
      },
    ]);

    const accepted = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${first.token}`)
      .send(payload);
    const replay = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${first.token}`)
      .send(payload);
    const otherActor = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${second.token}`)
      .send(payload);

    assert.deepEqual(accepted.body, { accepted: 1, duplicates: 0 });
    assert.deepEqual(replay.body, { accepted: 0, duplicates: 1 });
    assert.deepEqual(otherActor.body, { accepted: 1, duplicates: 0 });
    const [count] = await connection.db
      .select({ value: sql<number>`count(*)::int` })
      .from(appEvents);
    assert.equal(count.value, 2);
  });

  it("rejects unknown events, extra free-form properties, and oversized batches", async () => {
    const principal = await createPrincipal();
    const unknown = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(
        batch([
          {
            eventId: randomUUID(),
            occurredAt: now.toISOString(),
            eventName: "camera_frame_seen",
            properties: {},
          },
        ]),
      );
    const freeText = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(
        batch([
          {
            eventId: randomUUID(),
            occurredAt: now.toISOString(),
            eventName: "login_prompt_shown",
            properties: { trigger: "save_photo", note: "private free text" },
          },
        ]),
      );
    const event = {
      eventId: randomUUID(),
      occurredAt: now.toISOString(),
      eventName: "feedback_requested",
      properties: { source: "camera" },
    };
    const oversized = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(batch(Array.from({ length: 51 }, () => ({ ...event, eventId: randomUUID() }))));

    assert.equal(unknown.status, 400);
    assert.equal(freeText.status, 400);
    assert.equal(oversized.status, 400);
    const [count] = await connection.db
      .select({ value: sql<number>`count(*)::int` })
      .from(appEvents);
    assert.equal(count.value, 0);
  });

  it("rejects stale or future events and revoked sessions", async () => {
    const principal = await createPrincipal();
    const stale = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(
        batch([
          {
            eventId: randomUUID(),
            occurredAt: new Date(now.getTime() - 8 * 86_400_000).toISOString(),
            eventName: "login_prompt_shown",
            properties: { trigger: "save_photo" },
          },
        ]),
      );
    assert.equal(stale.status, 422);
    assert.equal(stale.body.code, "INVALID_EVENT_TIME");

    const future = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(
        batch([
          {
            eventId: randomUUID(),
            occurredAt: new Date(now.getTime() + 301_000).toISOString(),
            eventName: "login_prompt_shown",
            properties: { trigger: "save_photo" },
          },
        ]),
      );
    assert.equal(future.status, 422);
    assert.equal(future.body.code, "INVALID_EVENT_TIME");

    await connection.db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(eq(refreshSessions.id, principal.sessionId));
    const revoked = await request(eventApp())
      .post("/api/v1/app-events/batch")
      .set("Authorization", `Bearer ${principal.token}`)
      .send(
        batch([
          {
            eventId: randomUUID(),
            occurredAt: now.toISOString(),
            eventName: "login_prompt_shown",
            properties: { trigger: "save_photo" },
          },
        ]),
      );
    assert.equal(revoked.status, 401);
    assert.equal(revoked.body.code, "INVALID_TOKEN");
  });
});
