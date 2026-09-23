import { sql } from "drizzle-orm";
import {
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
import { users } from "./identity.js";

export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "IN_PROGRESS",
  "COMPLETED",
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

/** Product events are added by B-13. Retention cleanup is added by B-17. */
