import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["GUEST", "MEMBER"]);
export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);
export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "DELETION_PENDING",
  "DELETED",
]);
export const aspectRatioEnum = pgEnum("aspect_ratio", ["4:3", "9:16", "1:1"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountType: accountTypeEnum("account_type").notNull().default("GUEST"),
    role: userRoleEnum("role").notNull().default("USER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    displayName: varchar("display_name", { length: 80 }),
    profileImageUrl: text("profile_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("users_status_idx").on(table.status)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  locale: varchar("locale", { length: 35 }).notNull(),
  defaultAspectRatio: aspectRatioEnum("default_aspect_ratio").notNull().default("4:3"),
  allowLocationContext: boolean("allow_location_context").notNull().default(false),
  aiProcessingConsentVersion: varchar("ai_processing_consent_version", { length: 32 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshSessions = pgTable(
  "refresh_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    tokenFamilyId: uuid("token_family_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id").references((): AnyPgColumn => refreshSessions.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("refresh_sessions_token_hash_uidx").on(table.tokenHash),
    index("refresh_sessions_user_expires_idx").on(table.userId, table.expiresAt),
    index("refresh_sessions_installation_idx").on(table.installationId, table.createdAt),
    index("refresh_sessions_family_idx").on(table.tokenFamilyId),
    uniqueIndex("refresh_sessions_replaced_by_uidx")
      .on(table.replacedById)
      .where(sql`${table.replacedById} is not null`),
  ],
);
