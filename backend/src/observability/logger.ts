import pino, { type DestinationStream, type LevelWithSilent, type Logger } from "pino";

const redactedPaths = [
  "authorization",
  "cookie",
  "password",
  "accessToken",
  "refreshToken",
  "idToken",
  "token",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.accessToken",
  "*.refreshToken",
  "*.idToken",
  "*.token",
  "req.headers.authorization",
  "req.headers.cookie",
  "response.headers.set-cookie",
];

type LoggerOptions = {
  level?: LevelWithSilent;
  destination?: DestinationStream;
};

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino(
    {
      name: "dearshot-api",
      level: options.level ?? "info",
      redact: {
        paths: redactedPaths,
        censor: "[REDACTED]",
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
      base: {
        service: "dearshot-api",
      },
    },
    options.destination,
  );
}
