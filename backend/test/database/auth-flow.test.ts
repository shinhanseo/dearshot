import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { TokenService } from "../../src/auth/token-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { refreshSessions, users } from "../../src/db/schema/identity.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");

const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 8,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};

const authConfig: AuthConfig = {
  accessTokenSecret: "database-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-database-test",
  audience: "dearshot-android-database-test",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};

const logger = pino({ level: "silent" });
let connection: DatabaseConnection;
let authService: AuthService;
let tokenService: TokenService;

function createTestApp() {
  return createApp({
    logger,
    checkDatabase: () => verifyDatabaseConnection(connection.pool),
    auth: { authService, tokenService },
  });
}

async function createGuest(installationId = randomUUID()) {
  const response = await request(createTestApp()).post("/api/v1/auth/guest").send({
    installationId,
    locale: "ko-KR",
    appVersion: "1.0.0",
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers.pragma, "no-cache");
  return response.body;
}

describe("authentication database flows", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    authService = new AuthService(connection.db, tokenService, authConfig);
    await verifyDatabaseConnection(connection.pool);
  });

  beforeEach(async () => {
    await connection.db.execute(
      sql`truncate table refresh_sessions, user_preferences, users restart identity cascade`,
    );
  });

  after(async () => {
    await closeDatabaseConnection(connection.pool);
  });

  it("reuses the guest principal for the same installation and stores only token hashes", async () => {
    const installationId = randomUUID();
    const first = await createGuest(installationId);
    const second = await createGuest(installationId);

    assert.equal(second.principal.id, first.principal.id);
    assert.notEqual(second.refreshToken, first.refreshToken);

    const storedUsers = await connection.db.select().from(users);
    const storedSessions = await connection.db.select().from(refreshSessions);
    assert.equal(storedUsers.length, 1);
    assert.equal(storedSessions.length, 2);
    assert.equal(storedSessions[0].tokenHash.length, 64);
    assert.ok(storedSessions.every((session) => session.tokenHash !== first.refreshToken));
    assert.ok(storedSessions.every((session) => session.tokenHash !== second.refreshToken));
  });

  it("creates only one guest user for concurrent requests from the same installation", async () => {
    const installationId = randomUUID();
    const responses = await Promise.all([
      createGuest(installationId),
      createGuest(installationId),
      createGuest(installationId),
    ]);

    assert.equal(new Set(responses.map((response) => response.principal.id)).size, 1);
    const storedUsers = await connection.db.select().from(users);
    assert.equal(storedUsers.length, 1);
  });

  it("rotates refresh tokens and revokes the whole family when an old token is reused", async () => {
    const guest = await createGuest();
    const rotated = await request(createTestApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: guest.refreshToken });
    assert.equal(rotated.status, 200, JSON.stringify(rotated.body));

    const replay = await request(createTestApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: guest.refreshToken });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.code, "INVALID_TOKEN");

    const familyToken = await request(createTestApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    assert.equal(familyToken.status, 401);
  });

  it("allows only one concurrent refresh and invalidates its family after replay detection", async () => {
    const guest = await createGuest();
    const refresh = () =>
      request(createTestApp())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: guest.refreshToken });

    const responses = await Promise.all([refresh(), refresh()]);
    const success = responses.find((response) => response.status === 200);
    const rejected = responses.find((response) => response.status === 401);
    assert.ok(success);
    assert.ok(rejected);

    const nextAttempt = await refreshToken(success.body.refreshToken);
    assert.equal(nextAttempt.status, 401);
  });

  it("revokes the current session on logout", async () => {
    const guest = await createGuest();
    const logout = await request(createTestApp())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${guest.accessToken}`)
      .send({ refreshToken: guest.refreshToken });
    assert.equal(logout.status, 204, JSON.stringify(logout.body));

    const afterLogout = await refreshToken(guest.refreshToken);
    assert.equal(afterLogout.status, 401);
  });

  it("does not allow one access token to log out another user's refresh session", async () => {
    const first = await createGuest();
    const second = await createGuest();
    const mismatch = await request(createTestApp())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${first.accessToken}`)
      .send({ refreshToken: second.refreshToken });

    assert.equal(mismatch.status, 401);
    const secondStillWorks = await refreshToken(second.refreshToken);
    assert.equal(secondStillWorks.status, 200, JSON.stringify(secondStillWorks.body));
  });

  it("rejects expired sessions and sessions owned by deleted users", async () => {
    const expiredGuest = await createGuest();
    await connection.db
      .update(refreshSessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(refreshSessions.tokenHash, tokenService.hashRefreshToken(expiredGuest.refreshToken)));

    const expired = await refreshToken(expiredGuest.refreshToken);
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, "TOKEN_EXPIRED");

    const deletedGuest = await createGuest();
    await connection.db
      .update(users)
      .set({ status: "DELETED", deletedAt: new Date() })
      .where(eq(users.id, deletedGuest.principal.id));

    const deletedRefresh = await refreshToken(deletedGuest.refreshToken);
    assert.equal(deletedRefresh.status, 401);
    const deletedProfile = await request(createTestApp())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${deletedGuest.accessToken}`);
    assert.equal(deletedProfile.status, 401);
  });

  it("requires member authentication for GET /me", async () => {
    const guest = await createGuest();
    const response = await request(createTestApp())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${guest.accessToken}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "AUTH_REQUIRED");
  });
});

function refreshToken(token: string) {
  return request(createTestApp()).post("/api/v1/auth/refresh").send({ refreshToken: token });
}
