import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
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
export const authProviderEnum = pgEnum("auth_provider", ["GOOGLE", "KAKAO"]);
export const accountDeletionStatusEnum = pgEnum("account_deletion_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
]);

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

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerSubject: varchar("provider_subject", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_uidx").on(
      table.provider,
      table.providerSubject,
    ),
    uniqueIndex("auth_identities_user_provider_uidx").on(table.userId, table.provider),
  ],
);

export const oauthNonceUses = pgTable(
  "oauth_nonce_uses",
  {
    nonceHash: char("nonce_hash", { length: 64 }).primaryKey(),
    provider: authProviderEnum("provider").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("oauth_nonce_uses_expires_idx").on(table.tokenExpiresAt)],
);

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Deliberately not an FK: the request remains briefly available after the
    // user row has been erased so the client can display terminal status.
    userId: uuid("user_id").notNull(),
    status: accountDeletionStatusEnum("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: varchar("lease_owner", { length: 128 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("account_deletion_requests_user_uidx").on(table.userId),
    index("account_deletion_requests_claim_idx").on(table.status, table.nextAttemptAt, table.leaseExpiresAt),
    index("account_deletion_requests_expires_idx").on(table.expiresAt),
    check("account_deletion_requests_attempt_check", sql`${table.attemptCount} >= 0`),
    check(
      "account_deletion_requests_lease_check",
      sql`(${table.status} = 'PROCESSING' and ${table.leaseOwner} is not null and ${table.leaseExpiresAt} is not null) or (${table.status} <> 'PROCESSING' and ${table.leaseOwner} is null and ${table.leaseExpiresAt} is null)`,
    ),
    check(
      "account_deletion_requests_completion_check",
      sql`(${table.status} = 'COMPLETED' and ${table.completedAt} is not null) or (${table.status} <> 'COMPLETED' and ${table.completedAt} is null)`,
    ),
  ],
);
