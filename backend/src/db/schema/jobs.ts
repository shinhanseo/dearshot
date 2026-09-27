import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./identity.js";

export const uploadPurposeEnum = pgEnum("upload_purpose", [
  "SCENE_ANALYSIS",
  "PHOTO_FEEDBACK",
]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "READY",
  "CONSUMED",
  "DELETED",
  "EXPIRED",
]);

export const sceneAnalysisStatusEnum = pgEnum("scene_analysis_status", [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "NEEDS_USER_SELECTION",
  "FAILED",
  "CANCELLED",
]);

export type DeviceAnalysisSnapshot = {
  sceneClassifier?: {
    model: string;
    modelVersion: string;
    runtime: string;
    candidates: Array<{ label: string; confidence: number }>;
  };
  objectDetector?: {
    model: string;
    modelVersion: string;
    runtime: string;
    objects: Array<{
      label: string;
      confidence: number;
      box: { left: number; top: number; right: number; bottom: number };
    }>;
  };
};

export const imageUploads = pgTable(
  "image_uploads",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    purpose: uploadPurposeEnum("purpose").notNull(),
    storagePath: text("storage_path").notNull(),
    contentType: varchar("content_type", { length: 32 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    status: uploadStatusEnum("status").notNull().default("READY"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("image_uploads_storage_path_uidx").on(table.storagePath),
    index("image_uploads_owner_status_idx").on(table.ownerUserId, table.status),
    index("image_uploads_expires_idx").on(table.expiresAt),
    check("image_uploads_byte_size_check", sql`${table.byteSize} between 1 and 10485760`),
    check(
      "image_uploads_dimensions_check",
      sql`${table.width} between 1 and 8192 and ${table.height} between 1 and 8192`,
    ),
    check("image_uploads_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "image_uploads_content_type_check",
      sql`${table.contentType} in ('image/jpeg', 'image/webp')`,
    ),
    check(
      "image_uploads_consumed_at_check",
      sql`${table.status} <> 'CONSUMED' or ${table.consumedAt} is not null`,
    ),
    check(
      "image_uploads_deleted_at_check",
      sql`${table.status} not in ('DELETED', 'EXPIRED') or ${table.deletedAt} is not null`,
    ),
  ],
);

export const sceneAnalyses = pgTable(
  "scene_analyses",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => imageUploads.id, { onDelete: "restrict" }),
    status: sceneAnalysisStatusEnum("status").notNull().default("QUEUED"),
    sceneRevision: integer("scene_revision").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    locale: varchar("locale", { length: 35 }).notNull(),
    deviceAnalysis: jsonb("device_analysis").$type<DeviceAnalysisSnapshot>(),
    timezone: varchar("timezone", { length: 64 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationAccuracyMeters: doublePrecision("location_accuracy_meters"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    failureCode: varchar("failure_code", { length: 64 }),
    retryable: boolean("retryable"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("scene_analyses_upload_uidx").on(table.uploadId),
    index("scene_analyses_owner_created_idx").on(table.ownerUserId, table.createdAt),
    index("scene_analyses_status_created_idx").on(table.status, table.createdAt),
    index("scene_analyses_expires_idx").on(table.expiresAt),
    check("scene_analyses_revision_check", sql`${table.sceneRevision} >= 0`),
    check(
      "scene_analyses_location_pair_check",
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`,
    ),
    check(
      "scene_analyses_latitude_check",
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      "scene_analyses_longitude_check",
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    check(
      "scene_analyses_accuracy_check",
      sql`${table.locationAccuracyMeters} is null or ${table.locationAccuracyMeters} >= 0`,
    ),
    check(
      "scene_analyses_device_analysis_check",
      sql`${table.deviceAnalysis} is null or jsonb_typeof(${table.deviceAnalysis}) = 'object'`,
    ),
    check(
      "scene_analyses_cancelled_at_check",
      sql`${table.status} <> 'CANCELLED' or ${table.cancelledAt} is not null`,
    ),
  ],
);
