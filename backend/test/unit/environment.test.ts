import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnvironment } from "../../src/config/environment.js";

const baseEnvironment = {
  DATABASE_URL: "postgresql://user:password@postgres:5432/dearshot",
  JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters",
};

describe("environment configuration", () => {
  it("applies bounded authentication defaults in development", () => {
    const environment = loadEnvironment(baseEnvironment);

    assert.equal(environment.auth.accessTokenTtlSeconds, 900);
    assert.equal(environment.auth.refreshTokenTtlSeconds, 2_592_000);
    assert.equal(environment.auth.issuer, "dearshot-api");
  });

  it("rejects the documented placeholder JWT secret in production", () => {
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, NODE_ENV: "production" }),
      /JWT_ACCESS_SECRET must be replaced in production/,
    );
  });
});
