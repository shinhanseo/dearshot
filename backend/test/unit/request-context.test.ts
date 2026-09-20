import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { resolveRequestId } from "../../src/http/request-context.js";

describe("resolveRequestId", () => {
  it("keeps a valid UUID supplied by the client", () => {
    const requestId = randomUUID();

    assert.equal(resolveRequestId(requestId), requestId);
  });

  it("replaces missing or invalid IDs with a UUID", () => {
    const missing = resolveRequestId(undefined);
    const invalid = resolveRequestId("not-a-uuid\nforged-log-line");

    assert.match(missing, /^[0-9a-f-]{36}$/i);
    assert.match(invalid, /^[0-9a-f-]{36}$/i);
    assert.notEqual(invalid, "not-a-uuid\nforged-log-line");
  });
});
