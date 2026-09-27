import path from "node:path";
import { z } from "zod";
import type { UsageLimitConfig } from "../reliability/usage-limit-service.js";

const integerFromEnvironment = (name: string, fallback: number, minimum: number, maximum: number) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .int(`${name} must be an integer`)
    .min(minimum, `${name} must be at least ${minimum}`)
    .max(maximum, `${name} must be at most ${maximum}`)
    .default(fallback);

const booleanFromEnvironment = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(String(fallback) as "true" | "false")
    .transform((value) => value === "true");

const numberFromEnvironment = (name: string, fallback: number, minimum: number, maximum: number) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .min(minimum, `${name} must be at least ${minimum}`)
    .max(maximum, `${name} must be at most ${maximum}`)
    .default(fallback);

const semanticVersion = z.string().regex(/^\d+\.\d+\.\d+$/u, "must use MAJOR.MINOR.PATCH");

const commaSeparatedOrigins = z
  .string()
  .default("")
  .transform((value, context) => {
    const origins = [...new Set(value.split(",").map((origin) => origin.trim()).filter(Boolean))];
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("invalid origin");
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: `CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`,
        });
        return z.NEVER;
      }
    }
    return origins;
  });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    PORT: integerFromEnvironment("PORT", 3000, 1, 65_535),
    TRUST_PROXY_HOPS: integerFromEnvironment("TRUST_PROXY_HOPS", 0, 0, 2),
    CORS_ALLOWED_ORIGINS: commaSeparatedOrigins,
    AI_PROVIDER: z.enum(["mock", "gemini"]).default("mock"),
    AI_API_KEY: z.string().default(""),
    GEMINI_MODEL: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,79}$/u).default("gemini-3.5-flash"),
    GEMINI_TIMEOUT_MS: integerFromEnvironment("GEMINI_TIMEOUT_MS", 10_000, 1_000, 30_000),
    GEMINI_MAX_RESPONSE_BYTES: integerFromEnvironment(
      "GEMINI_MAX_RESPONSE_BYTES", 262_144, 4_096, 1_048_576,
    ),
    SCENE_RECOMMENDATION_MAX_CANDIDATES: integerFromEnvironment(
      "SCENE_RECOMMENDATION_MAX_CANDIDATES", 12, 1, 20,
    ),
    SCENE_RECOMMENDATION_MIN_CONFIDENCE: numberFromEnvironment(
      "SCENE_RECOMMENDATION_MIN_CONFIDENCE", 0.55, 0, 1,
    ),
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
    IDEMPOTENCY_TTL_SECONDS: integerFromEnvironment(
      "IDEMPOTENCY_TTL_SECONDS",
      86_400,
      3_600,
      604_800,
    ),
    SCENE_ANALYSIS_RETENTION_DAYS: integerFromEnvironment(
      "SCENE_ANALYSIS_RETENTION_DAYS",
      7,
      1,
      30,
    ),
    SCENE_WORKER_ENABLED: booleanFromEnvironment(true),
    SCENE_WORKER_POLL_INTERVAL_MS: integerFromEnvironment(
      "SCENE_WORKER_POLL_INTERVAL_MS", 1_000, 100, 60_000,
    ),
    SCENE_WORKER_LEASE_SECONDS: integerFromEnvironment(
      "SCENE_WORKER_LEASE_SECONDS", 30, 5, 300,
    ),
    SCENE_WORKER_MAX_ATTEMPTS: integerFromEnvironment(
      "SCENE_WORKER_MAX_ATTEMPTS", 3, 1, 10,
    ),
    SCENE_WORKER_RETRY_BASE_SECONDS: integerFromEnvironment(
      "SCENE_WORKER_RETRY_BASE_SECONDS", 1, 1, 300,
    ),
    SCENE_SSE_POLL_INTERVAL_MS: integerFromEnvironment(
      "SCENE_SSE_POLL_INTERVAL_MS", 500, 100, 10_000,
    ),
    SCENE_SSE_HEARTBEAT_SECONDS: integerFromEnvironment(
      "SCENE_SSE_HEARTBEAT_SECONDS", 15, 5, 60,
    ),
    SCENE_EVENT_RETENTION_HOURS: integerFromEnvironment(
      "SCENE_EVENT_RETENTION_HOURS", 24, 1, 168,
    ),
    USAGE_TIMEZONE: z.literal("UTC").default("UTC"),
    GUEST_SCENE_ANALYSES_PER_DAY: integerFromEnvironment(
      "GUEST_SCENE_ANALYSES_PER_DAY",
      5,
      1,
      1_000,
    ),
    GUEST_PHOTO_FEEDBACKS_PER_DAY: integerFromEnvironment(
      "GUEST_PHOTO_FEEDBACKS_PER_DAY",
      10,
      1,
      1_000,
    ),
    MEMBER_SCENE_ANALYSES_PER_DAY: integerFromEnvironment(
      "MEMBER_SCENE_ANALYSES_PER_DAY",
      50,
      1,
      10_000,
    ),
    MEMBER_PHOTO_FEEDBACKS_PER_DAY: integerFromEnvironment(
      "MEMBER_PHOTO_FEEDBACKS_PER_DAY",
      100,
      1,
      10_000,
    ),
    AI_IP_RATE_LIMIT_PER_MINUTE: integerFromEnvironment(
      "AI_IP_RATE_LIMIT_PER_MINUTE",
      30,
      1,
      10_000,
    ),
    AUTH_IP_RATE_LIMIT_PER_MINUTE: integerFromEnvironment(
      "AUTH_IP_RATE_LIMIT_PER_MINUTE",
      20,
      1,
      1_000,
    ),
    APP_EVENT_BATCHES_PER_IP_PER_MINUTE: integerFromEnvironment(
      "APP_EVENT_BATCHES_PER_IP_PER_MINUTE",
      30,
      1,
      1_000,
    ),
    APP_MINIMUM_SUPPORTED_VERSION: semanticVersion.default("1.0.0"),
    APP_LATEST_VERSION: semanticVersion.default("1.0.0"),
    APP_MAINTENANCE: booleanFromEnvironment(false),
    APP_CATALOG_VERSION: z.string().min(1).max(64).default("development"),
    APP_RECOMMENDED_LONG_EDGE_PX: integerFromEnvironment(
      "APP_RECOMMENDED_LONG_EDGE_PX",
      2_048,
      256,
      8_192,
    ),
    PRIVACY_POLICY_VERSION: z.string().min(1).max(32).default("2026-09-01"),
    PRIVACY_POLICY_URL: z.string().url().default("https://dearshot.app/privacy"),
    TERMS_VERSION: z.string().min(1).max(32).default("2026-09-01"),
    TERMS_URL: z.string().url().default("https://dearshot.app/terms"),
    FEATURE_KAKAO_LOGIN: booleanFromEnvironment(true),
    FEATURE_LOCATION_CONTEXT: booleanFromEnvironment(true),
    FEATURE_FEEDBACK_COMPARISON: booleanFromEnvironment(true),
    APP_EVENT_RETENTION_DAYS: integerFromEnvironment(
      "APP_EVENT_RETENTION_DAYS",
      90,
      1,
      365,
    ),
    APP_EVENT_MAX_PAST_AGE_DAYS: integerFromEnvironment(
      "APP_EVENT_MAX_PAST_AGE_DAYS",
      7,
      1,
      30,
    ),
    APP_EVENT_MAX_FUTURE_SKEW_SECONDS: integerFromEnvironment(
      "APP_EVENT_MAX_FUTURE_SKEW_SECONDS",
      300,
      0,
      3_600,
    ),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && environment.AI_PROVIDER !== "gemini") {
      context.addIssue({
        code: "custom",
        path: ["AI_PROVIDER"],
        message: "AI_PROVIDER must be gemini in production",
      });
    }
    if (environment.AI_PROVIDER === "gemini" && environment.AI_API_KEY.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["AI_API_KEY"],
        message: "AI_API_KEY is required when AI_PROVIDER is gemini",
      });
    }
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
    if (
      environment.NODE_ENV === "production" &&
      environment.CORS_ALLOWED_ORIGINS.some((origin) => new URL(origin).protocol !== "https:")
    ) {
      context.addIssue({
        code: "custom",
        path: ["CORS_ALLOWED_ORIGINS"],
        message: "CORS_ALLOWED_ORIGINS must use HTTPS origins in production",
      });
    }
    if (!path.isAbsolute(environment.UPLOAD_ROOT)) {
      context.addIssue({
        code: "custom",
        path: ["UPLOAD_ROOT"],
        message: "UPLOAD_ROOT must be an absolute path",
      });
    }
    const compareVersions = (left: string, right: string) => {
      const leftParts = left.split(".").map(Number);
      const rightParts = right.split(".").map(Number);
      for (let index = 0; index < 3; index += 1) {
        if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
      }
      return 0;
    };
    if (
      compareVersions(environment.APP_MINIMUM_SUPPORTED_VERSION, environment.APP_LATEST_VERSION) >
      0
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_MINIMUM_SUPPORTED_VERSION"],
        message: "APP_MINIMUM_SUPPORTED_VERSION cannot be newer than APP_LATEST_VERSION",
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
  http: {
    trustProxyHops: number;
    corsAllowedOrigins: string[];
  };
  database: DatabaseConfig;
  ai: {
    provider: "mock" | "gemini";
    apiKey: string;
    gemini: { model: string; timeoutMillis: number; maximumResponseBytes: number };
  };
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
  idempotency: { ttlSeconds: number };
  sceneAnalysis: {
    retentionDays: number;
    workerEnabled: boolean;
    workerPollIntervalMillis: number;
    workerLeaseSeconds: number;
    workerMaxAttempts: number;
    workerRetryBaseSeconds: number;
    ssePollIntervalMillis: number;
    sseHeartbeatSeconds: number;
    eventRetentionHours: number;
    maximumCandidates: number;
    minimumConfidence: number;
  };
  usage: UsageLimitConfig;
  rateLimits: {
    aiRequestsPerIpPerMinute: number;
    authRequestsPerIpPerMinute: number;
    appEventBatchesPerIpPerMinute: number;
  };
  appConfig: {
    minimumSupportedVersion: string;
    latestVersion: string;
    maintenance: boolean;
    catalogVersion: string;
    recommendedLongEdgePixels: number;
    legal: {
      privacyPolicyVersion: string;
      privacyPolicyUrl: string;
      termsVersion: string;
      termsUrl: string;
    };
    features: {
      kakaoLogin: boolean;
      locationContext: boolean;
      feedbackComparison: boolean;
    };
  };
  productEvents: {
    retentionDays: number;
    maximumPastAgeDays: number;
    maximumFutureSkewSeconds: number;
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
    http: {
      trustProxyHops: parsed.data.TRUST_PROXY_HOPS,
      corsAllowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS,
    },
    ai: {
      provider: parsed.data.AI_PROVIDER,
      apiKey: parsed.data.AI_API_KEY,
      gemini: {
        model: parsed.data.GEMINI_MODEL,
        timeoutMillis: parsed.data.GEMINI_TIMEOUT_MS,
        maximumResponseBytes: parsed.data.GEMINI_MAX_RESPONSE_BYTES,
      },
    },
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
    idempotency: { ttlSeconds: parsed.data.IDEMPOTENCY_TTL_SECONDS },
    sceneAnalysis: {
      retentionDays: parsed.data.SCENE_ANALYSIS_RETENTION_DAYS,
      workerEnabled: parsed.data.SCENE_WORKER_ENABLED,
      workerPollIntervalMillis: parsed.data.SCENE_WORKER_POLL_INTERVAL_MS,
      workerLeaseSeconds: parsed.data.SCENE_WORKER_LEASE_SECONDS,
      workerMaxAttempts: parsed.data.SCENE_WORKER_MAX_ATTEMPTS,
      workerRetryBaseSeconds: parsed.data.SCENE_WORKER_RETRY_BASE_SECONDS,
      ssePollIntervalMillis: parsed.data.SCENE_SSE_POLL_INTERVAL_MS,
      sseHeartbeatSeconds: parsed.data.SCENE_SSE_HEARTBEAT_SECONDS,
      eventRetentionHours: parsed.data.SCENE_EVENT_RETENTION_HOURS,
      maximumCandidates: parsed.data.SCENE_RECOMMENDATION_MAX_CANDIDATES,
      minimumConfidence: parsed.data.SCENE_RECOMMENDATION_MIN_CONFIDENCE,
    },
    usage: {
      timezone: parsed.data.USAGE_TIMEZONE,
      guest: {
        sceneAnalysesPerDay: parsed.data.GUEST_SCENE_ANALYSES_PER_DAY,
        photoFeedbacksPerDay: parsed.data.GUEST_PHOTO_FEEDBACKS_PER_DAY,
      },
      member: {
        sceneAnalysesPerDay: parsed.data.MEMBER_SCENE_ANALYSES_PER_DAY,
        photoFeedbacksPerDay: parsed.data.MEMBER_PHOTO_FEEDBACKS_PER_DAY,
      },
    },
    rateLimits: {
      aiRequestsPerIpPerMinute: parsed.data.AI_IP_RATE_LIMIT_PER_MINUTE,
      authRequestsPerIpPerMinute: parsed.data.AUTH_IP_RATE_LIMIT_PER_MINUTE,
      appEventBatchesPerIpPerMinute: parsed.data.APP_EVENT_BATCHES_PER_IP_PER_MINUTE,
    },
    appConfig: {
      minimumSupportedVersion: parsed.data.APP_MINIMUM_SUPPORTED_VERSION,
      latestVersion: parsed.data.APP_LATEST_VERSION,
      maintenance: parsed.data.APP_MAINTENANCE,
      catalogVersion: parsed.data.APP_CATALOG_VERSION,
      recommendedLongEdgePixels: parsed.data.APP_RECOMMENDED_LONG_EDGE_PX,
      legal: {
        privacyPolicyVersion: parsed.data.PRIVACY_POLICY_VERSION,
        privacyPolicyUrl: parsed.data.PRIVACY_POLICY_URL,
        termsVersion: parsed.data.TERMS_VERSION,
        termsUrl: parsed.data.TERMS_URL,
      },
      features: {
        kakaoLogin: parsed.data.FEATURE_KAKAO_LOGIN,
        locationContext: parsed.data.FEATURE_LOCATION_CONTEXT,
        feedbackComparison: parsed.data.FEATURE_FEEDBACK_COMPARISON,
      },
    },
    productEvents: {
      retentionDays: parsed.data.APP_EVENT_RETENTION_DAYS,
      maximumPastAgeDays: parsed.data.APP_EVENT_MAX_PAST_AGE_DAYS,
      maximumFutureSkewSeconds: parsed.data.APP_EVENT_MAX_FUTURE_SKEW_SECONDS,
    },
    database: {
      connectionString: parsed.data.DATABASE_URL,
      maxConnections: parsed.data.DB_POOL_MAX,
      connectionTimeoutMillis: parsed.data.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: parsed.data.DB_IDLE_TIMEOUT_MS,
    },
  };
}
