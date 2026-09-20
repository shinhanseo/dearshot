import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Writable } from "node:stream";
import type { DestinationStream } from "pino";
import { createLogger } from "../../src/observability/logger.js";

describe("application logger", () => {
  it("redacts token and password fields from structured logs", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }) as DestinationStream;
    const logger = createLogger({ destination });

    logger.info(
      {
        accessToken: "access-secret",
        identity: { refreshToken: "refresh-secret", password: "password-secret" },
        safeField: "visible",
      },
      "redaction check",
    );

    assert.doesNotMatch(output, /access-secret|refresh-secret|password-secret/);
    assert.match(output, /\[REDACTED\]/);
    assert.match(output, /visible/);
  });
});
