import { z } from "zod";

const integerFromEnvironment = (name: string, fallback: number, minimum: number, maximum: number) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .int(`${name} must be an integer`)
    .min(minimum, `${name} must be at least ${minimum}`)
    .max(maximum, `${name} must be at most ${maximum}`)
    .default(fallback);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: integerFromEnvironment("PORT", 3000, 1, 65_535),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
      message: "DATABASE_URL must use the postgresql:// or postgres:// protocol",
    }),
  DB_POOL_MAX: integerFromEnvironment("DB_POOL_MAX", 10, 1, 50),
  DB_CONNECTION_TIMEOUT_MS: integerFromEnvironment(
    "DB_CONNECTION_TIMEOUT_MS",
    5_000,
    100,
    60_000,
  ),
  DB_IDLE_TIMEOUT_MS: integerFromEnvironment("DB_IDLE_TIMEOUT_MS", 30_000, 1_000, 300_000),
});

export type DatabaseConfig = {
  connectionString: string;
  maxConnections: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
};

export type Environment = {
  nodeEnvironment: "development" | "test" | "production";
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  port: number;
  database: DatabaseConfig;
};

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    nodeEnvironment: parsed.data.NODE_ENV,
    logLevel: parsed.data.LOG_LEVEL,
    port: parsed.data.PORT,
    database: {
      connectionString: parsed.data.DATABASE_URL,
      maxConnections: parsed.data.DB_POOL_MAX,
      connectionTimeoutMillis: parsed.data.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: parsed.data.DB_IDLE_TIMEOUT_MS,
    },
  };
}
