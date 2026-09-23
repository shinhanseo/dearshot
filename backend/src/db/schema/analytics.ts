import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { accountTypeEnum, users } from "./identity.js";

export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "IN_PROGRESS",
  "COMPLETED",
]);

export const appEventNameEnum = pgEnum("app_event_name", [
  "scene_analysis_requested",
  "scene_analysis_completed",
  "scene_analysis_failed",
  "template_selected",
  "capture_completed",
  "feedback_requested",
  "feedback_completed",
  "feedback_failed",
  "retake_started",
  "photo_saved",
  "login_prompt_shown",
  "login_prompt_completed",
]);

export const dailyUsage = pgTable(
  "daily_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date", { mode: "string" }).notNull(),
    sceneAnalysisCount: integer("scene_analysis_count").notNull().default(0),
    photoFeedbackCount: integer("photo_feedback_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.usageDate] }),
    check(
      "daily_usage_nonnegative_check",
      sql`${table.sceneAnalysisCount} >= 0 and ${table.photoFeedbackCount} >= 0`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 192 }).notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    status: idempotencyStatusEnum("status").notNull().default("IN_PROGRESS"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    resourceId: uuid("resource_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_records_principal_scope_key_uidx").on(
      table.userId,
      table.scope,
      table.idempotencyKey,
    ),
    index("idempotency_records_expires_idx").on(table.expiresAt),
    check("idempotency_records_hash_check", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "idempotency_records_completed_check",
      sql`${table.status} <> 'COMPLETED' or (${table.responseStatus} is not null and ${table.completedAt} is not null)`,
    ),
  ],
);

export const appEvents = pgTable(
  "app_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: uuid("event_id").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorType: accountTypeEnum("actor_type").notNull(),
    sessionId: uuid("session_id").notNull(),
    eventName: appEventNameEnum("event_name").notNull(),
    appVersion: varchar("app_version", { length: 32 }).notNull(),
    osVersion: varchar("os_version", { length: 32 }).notNull(),
    locale: varchar("locale", { length: 35 }).notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull(),
    requestId: uuid("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("app_events_actor_event_uidx").on(table.actorId, table.eventId),
    index("app_events_name_occurred_idx").on(table.eventName, table.occurredAt),
    index("app_events_actor_occurred_idx").on(table.actorId, table.occurredAt.desc()),
    index("app_events_expires_idx").on(table.expiresAt),
    check("app_events_properties_object_check", sql`jsonb_typeof(${table.properties}) = 'object'`),
    check("app_events_expiry_check", sql`${table.expiresAt} > ${table.receivedAt}`),
  ],
);

/** Automated retention cleanup is added by B-17. */
