import path from "node:path";
import { z } from "zod";

const integerFromEnvironment = (name: string, fallback: number, minimum: number, maximum: number) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .int(`${name} must be an integer`)
    .min(minimum, `${name} must be at least ${minimum}`)
    .max(maximum, `${name} must be at most ${maximum}`)
    .default(fallback);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    PORT: integerFromEnvironment("PORT", 3000, 1, 65_535),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_ISSUER: z.string().min(1).default("dearshot-api"),
    JWT_AUDIENCE: z.string().min(1).default("dearshot-android"),
    ACCESS_TOKEN_TTL_SECONDS: integerFromEnvironment(
      "ACCESS_TOKEN_TTL_SECONDS",
      900,
      60,
      3_600,
    ),
    REFRESH_TOKEN_TTL_SECONDS: integerFromEnvironment(
      "REFRESH_TOKEN_TTL_SECONDS",
      2_592_000,
      3_600,
      7_776_000,
    ),
    GOOGLE_WEB_CLIENT_ID: z.string().min(1).default("replace-with-google-web-client-id"),
    KAKAO_APP_ID: z
      .string()
      .refine(
        (value) => value === "replace-with-kakao-app-id" || /^\d+$/u.test(value),
        "KAKAO_APP_ID must be a numeric Kakao app ID",
      )
      .default("replace-with-kakao-app-id"),
    KAKAO_API_TIMEOUT_MS: integerFromEnvironment("KAKAO_API_TIMEOUT_MS", 3_000, 500, 10_000),
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
    PUBLIC_ASSET_BASE_URL: z.string().url().default("http://localhost:3000/assets/catalog"),
    CATALOG_ASSET_ROOT: z.string().min(1).default("catalog/assets"),
    UPLOAD_ROOT: z.string().min(1).default("/srv/dearshot/uploads"),
    UPLOAD_MAX_BYTES: integerFromEnvironment("UPLOAD_MAX_BYTES", 10_485_760, 1_024, 10_485_760),
    UPLOAD_MAX_DIMENSION_PX: integerFromEnvironment(
      "UPLOAD_MAX_DIMENSION_PX",
      8_192,
      64,
      8_192,
    ),
    UPLOAD_MAX_PIXELS: integerFromEnvironment(
      "UPLOAD_MAX_PIXELS",
      40_000_000,
      4_096,
      67_108_864,
    ),
    UPLOAD_TTL_SECONDS: integerFromEnvironment("UPLOAD_TTL_SECONDS", 3_600, 60, 3_600),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.JWT_ACCESS_SECRET.startsWith("replace-with-")
    ) {
      context.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET must be replaced in production",
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      environment.GOOGLE_WEB_CLIENT_ID.startsWith("replace-with-")
    ) {
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_WEB_CLIENT_ID"],
        message: "GOOGLE_WEB_CLIENT_ID must be replaced in production",
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      environment.KAKAO_APP_ID.startsWith("replace-with-")
    ) {
      context.addIssue({
        code: "custom",
        path: ["KAKAO_APP_ID"],
        message: "KAKAO_APP_ID must be replaced in production",
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      new URL(environment.PUBLIC_ASSET_BASE_URL).protocol !== "https:"
    ) {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_ASSET_BASE_URL"],
        message: "PUBLIC_ASSET_BASE_URL must use HTTPS in production",
      });
    }
    if (!path.isAbsolute(environment.UPLOAD_ROOT)) {
      context.addIssue({
        code: "custom",
        path: ["UPLOAD_ROOT"],
        message: "UPLOAD_ROOT must be an absolute path",
      });
    }
  });

export type DatabaseConfig = {
  connectionString: string;
  maxConnections: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
};

export type AuthConfig = {
  accessTokenSecret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
};

export type Environment = {
  nodeEnvironment: "development" | "test" | "production";
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  port: number;
  database: DatabaseConfig;
  auth: AuthConfig;
  google: { webClientId: string };
  kakao: { appId: string; apiTimeoutMillis: number };
  catalog: { assetBaseUrl: string; assetRoot: string };
  uploads: {
    root: string;
    maxBytes: number;
    maxDimensionPixels: number;
    maxPixels: number;
    ttlSeconds: number;
  };
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
    auth: {
      accessTokenSecret: parsed.data.JWT_ACCESS_SECRET,
      issuer: parsed.data.JWT_ISSUER,
      audience: parsed.data.JWT_AUDIENCE,
      accessTokenTtlSeconds: parsed.data.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: parsed.data.REFRESH_TOKEN_TTL_SECONDS,
    },
    google: { webClientId: parsed.data.GOOGLE_WEB_CLIENT_ID },
    kakao: {
      appId: parsed.data.KAKAO_APP_ID,
      apiTimeoutMillis: parsed.data.KAKAO_API_TIMEOUT_MS,
    },
    catalog: {
      assetBaseUrl: parsed.data.PUBLIC_ASSET_BASE_URL,
      assetRoot: parsed.data.CATALOG_ASSET_ROOT,
    },
    uploads: {
      root: parsed.data.UPLOAD_ROOT,
      maxBytes: parsed.data.UPLOAD_MAX_BYTES,
      maxDimensionPixels: parsed.data.UPLOAD_MAX_DIMENSION_PX,
      maxPixels: parsed.data.UPLOAD_MAX_PIXELS,
      ttlSeconds: parsed.data.UPLOAD_TTL_SECONDS,
    },
    database: {
      connectionString: parsed.data.DATABASE_URL,
      maxConnections: parsed.data.DB_POOL_MAX,
      connectionTimeoutMillis: parsed.data.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: parsed.data.DB_IDLE_TIMEOUT_MS,
    },
  };
}
