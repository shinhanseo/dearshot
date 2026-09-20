import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { aspectRatioEnum, users } from "./identity.js";

export const templateStatusEnum = pgEnum("template_status", [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);
export const templateVersionStatusEnum = pgEnum("template_version_status", [
  "DRAFT",
  "PUBLISHED",
]);
export const guideTypeEnum = pgEnum("guide_type", ["SVG_OVERLAY", "RASTER_OVERLAY"]);

export type GuideConfig = {
  coordinateSpace: "NORMALIZED";
  referenceWidth: number;
  referenceHeight: number;
  safeArea: { left: number; top: number; right: number; bottom: number };
};

export type TemplateInstruction = { order: number; text: string };

export const catalogState = pgTable(
  "catalog_state",
  {
    id: varchar("id", { length: 20 }).primaryKey(),
    catalogVersion: varchar("catalog_version", { length: 64 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("catalog_state_singleton_check", sql`${table.id} = 'current'`)],
);

export const scenes = pgTable(
  "scenes",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    active: boolean("active").notNull().default(true),
    thumbnailPath: text("thumbnail_path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("scenes_active_sort_idx").on(table.active, table.sortOrder, table.key),
  ],
);

export const sceneLocalizations = pgTable(
  "scene_localizations",
  {
    sceneKey: varchar("scene_key", { length: 64 })
      .notNull()
      .references(() => scenes.key, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 35 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sceneKey, table.locale] })],
);

export const templates = pgTable(
  "templates",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    status: templateStatusEnum("status").notNull().default("DRAFT"),
    peopleCount: integer("people_count").notNull(),
    supportedAspectRatios: aspectRatioEnum("supported_aspect_ratios").array().notNull(),
    currentVersion: integer("current_version"),
    likeCount: integer("like_count").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("templates_people_count_check", sql`${table.peopleCount} between 1 and 10`),
    check("templates_like_count_check", sql`${table.likeCount} >= 0`),
    check(
      "templates_published_version_check",
      sql`${table.status} <> 'PUBLISHED' or ${table.currentVersion} is not null`,
    ),
    index("templates_status_sort_idx").on(table.status, table.sortOrder, table.id),
    index("templates_status_popular_idx").on(table.status, table.likeCount, table.id),
  ],
);

export const templateScenes = pgTable(
  "template_scenes",
  {
    templateId: varchar("template_id", { length: 80 })
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    sceneKey: varchar("scene_key", { length: 64 })
      .notNull()
      .references(() => scenes.key, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.sceneKey] }),
    index("template_scenes_scene_sort_idx").on(table.sceneKey, table.sortOrder, table.templateId),
  ],
);

export const templateVersions = pgTable(
  "template_versions",
  {
    templateId: varchar("template_id", { length: 80 })
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: templateVersionStatusEnum("status").notNull().default("DRAFT"),
    previewPath: text("preview_path").notNull(),
    thumbnailPath: text("thumbnail_path").notNull(),
    guideType: guideTypeEnum("guide_type").notNull(),
    guideAssetPath: text("guide_asset_path").notNull(),
    guideConfig: jsonb("guide_config").$type<GuideConfig>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.version] }),
    check("template_versions_version_check", sql`${table.version} > 0`),
    check(
      "template_versions_published_at_check",
      sql`${table.status} <> 'PUBLISHED' or ${table.publishedAt} is not null`,
    ),
    index("template_versions_published_idx").on(table.status, table.publishedAt, table.templateId),
  ],
);

export const templateVersionLocalizations = pgTable(
  "template_version_localizations",
  {
    templateId: varchar("template_id", { length: 80 }).notNull(),
    version: integer("version").notNull(),
    locale: varchar("locale", { length: 35 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    summary: text("summary").notNull(),
    instructions: jsonb("instructions").$type<TemplateInstruction[]>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.version, table.locale] }),
    foreignKey({
      columns: [table.templateId, table.version],
      foreignColumns: [templateVersions.templateId, templateVersions.version],
      name: "template_version_localizations_version_fk",
    }).onDelete("cascade"),
  ],
);

export const templateLikes = pgTable(
  "template_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: varchar("template_id", { length: 80 })
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.templateId] }),
    index("template_likes_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.templateId.desc(),
    ),
    index("template_likes_template_created_idx").on(table.templateId, table.createdAt),
  ],
);

export const templateBookmarks = pgTable(
  "template_bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: varchar("template_id", { length: 80 })
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.templateId] }),
    index("template_bookmarks_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.templateId.desc(),
    ),
  ],
);
