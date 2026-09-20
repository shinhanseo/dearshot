import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoginTicket, type TokenPayload } from "google-auth-library";
import { GoogleAuthLibraryVerifier } from "../../src/auth/google/google-identity-verifier.js";
import { ApiError } from "../../src/http/api-error.js";

const payload: TokenPayload = {
  iss: "https://accounts.google.com",
  sub: "google-subject-123",
  aud: "google-client-id.apps.googleusercontent.com",
  iat: Math.floor(Date.now() / 1_000),
  exp: Math.floor(Date.now() / 1_000) + 3_600,
  nonce: "secure-google-nonce-1234",
  name: "  Verified User  ",
  picture: "https://example.com/avatar.jpg",
  locale: "ko_KR",
};

describe("GoogleAuthLibraryVerifier", () => {
  it("passes the configured audience to Google's verifier and accepts the matching nonce", async () => {
    let observedOptions: unknown;
    const client = {
      verifyIdToken: async (options: unknown) => {
        observedOptions = options;
        return new LoginTicket(undefined, payload);
      },
    };
    const verifier = new GoogleAuthLibraryVerifier(payload.aud, client);

    const identity = await verifier.verify("raw-google-id-token", payload.nonce!);

    assert.deepEqual(observedOptions, {
      idToken: "raw-google-id-token",
      audience: payload.aud,
    });
    assert.equal(identity.subject, payload.sub);
    assert.equal(identity.displayName, "Verified User");
    assert.equal(identity.locale, "ko-KR");
  });

  it("rejects a missing or mismatched nonce with a stable public error", async () => {
    const client = {
      verifyIdToken: async () => new LoginTicket(undefined, payload),
    };
    const verifier = new GoogleAuthLibraryVerifier(payload.aud, client);

    await assert.rejects(
      verifier.verify("raw-google-id-token", "different-nonce-12345"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.statusCode === 401 &&
        error.code === "INVALID_TOKEN" &&
        !error.message.includes("different-nonce"),
    );
  });

  it("does not expose Google library errors", async () => {
    const client = {
      verifyIdToken: async () => {
        throw new Error("provider internals and raw token details");
      },
    };
    const verifier = new GoogleAuthLibraryVerifier(payload.aud, client);

    await assert.rejects(
      verifier.verify("raw-google-id-token", payload.nonce!),
      (error: unknown) =>
        error instanceof ApiError &&
        error.statusCode === 401 &&
        error.message === "Google ID token is invalid",
    );
  });
});
