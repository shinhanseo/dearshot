import { sql } from "drizzle-orm";
import {
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
