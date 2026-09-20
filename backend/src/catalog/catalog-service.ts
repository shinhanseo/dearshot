import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  catalogState,
  sceneLocalizations,
  scenes,
  templateBookmarks,
  templateLikes,
  templateScenes,
  templateVersionLocalizations,
  templateVersions,
  templates,
} from "../db/schema/catalog.js";
import { ApiError } from "../http/api-error.js";

export type TemplateSort = "recommended" | "popular" | "latest";
export type ListTemplatesQuery = {
  locale: string;
  scene?: string;
  aspectRatio?: "4:3" | "9:16" | "1:1";
  peopleCount?: number;
  sort: TemplateSort;
  cursor?: string;
  limit: number;
};

export type MemberCollectionKind = "liked" | "bookmarked";
export type MemberCollectionQuery = {
  locale: string;
  cursor?: string;
  limit: number;
};

type CursorPayload = {
  v: 1;
  sort: TemplateSort;
  filter: string;
  value: string | number;
  id: string;
};

type TemplateRow = {
  template: typeof templates.$inferSelect;
  version: typeof templateVersions.$inferSelect;
};

type CollectionCursor = {
  v: 1;
  kind: MemberCollectionKind;
  userId: string;
  createdAt: string;
  templateId: string;
};

const FALLBACK_LOCALE = "en-US";

function assetUrl(baseUrl: string, relativePath: string) {
  return `${baseUrl.replace(/\/$/u, "")}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function selectLocalization<T extends { locale: string }>(items: T[], requested: string): T {
  const exact = items.find((item) => item.locale === requested);
  const fallback = items.find((item) => item.locale === FALLBACK_LOCALE);
  if (!exact && !fallback) throw new Error("Published catalog item is missing its fallback locale");
  return exact ?? fallback!;
}

function filterKey(query: ListTemplatesQuery) {
  return JSON.stringify({
    scene: query.scene ?? null,
    aspectRatio: query.aspectRatio ?? null,
    peopleCount: query.peopleCount ?? null,
  });
}

function encodeCursor(payload: CursorPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string, query: ListTemplatesQuery): CursorPayload {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorPayload;
    if (
      parsed.v !== 1 ||
      parsed.sort !== query.sort ||
      parsed.filter !== filterKey(query) ||
      typeof parsed.id !== "string" ||
      (typeof parsed.value !== "string" && typeof parsed.value !== "number")
    ) {
      throw new Error("cursor mismatch");
    }
    return parsed;
  } catch (cause) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_CURSOR",
      message: "Cursor is invalid for this catalog query",
      cause,
    });
  }
}

function encodeCollectionCursor(payload: CollectionCursor) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCollectionCursor(
  value: string,
  userId: string,
  kind: MemberCollectionKind,
): CollectionCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CollectionCursor;
    if (
      parsed.v !== 1 ||
      parsed.kind !== kind ||
      parsed.userId !== userId ||
      typeof parsed.templateId !== "string" ||
      Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      throw new Error("collection cursor mismatch");
    }
    return parsed;
  } catch (cause) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_CURSOR",
      message: "Cursor is invalid for this member collection",
      cause,
    });
  }
}

export class CatalogService {
  constructor(
    private readonly database: Database,
    private readonly assetBaseUrl: string,
  ) {}

  private async version() {
    const state = await this.database.query.catalogState.findFirst({
      where: eq(catalogState.id, "current"),
    });
    return state?.catalogVersion ?? "uninitialized";
  }

  async listScenes(locale: string) {
    const [catalogVersion, sceneRows, localizationRows, mappingRows, publishedTemplates] =
      await Promise.all([
        this.version(),
        this.database.select().from(scenes).where(eq(scenes.active, true)),
        this.database.select().from(sceneLocalizations),
        this.database.select().from(templateScenes),
        this.database
          .select({ id: templates.id })
          .from(templates)
          .where(eq(templates.status, "PUBLISHED")),
      ]);
    const publishedIds = new Set(publishedTemplates.map((template) => template.id));

    return {
      catalogVersion,
      items: sceneRows
        .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
        .map((scene) => {
          const localization = selectLocalization(
            localizationRows.filter((item) => item.sceneKey === scene.key),
            locale,
          );
          return {
            key: scene.key,
            displayName: localization.displayName,
            thumbnailUrl: assetUrl(this.assetBaseUrl, scene.thumbnailPath),
            templateCount: mappingRows.filter(
              (mapping) => mapping.sceneKey === scene.key && publishedIds.has(mapping.templateId),
            ).length,
            active: scene.active,
          };
        }),
    };
  }

  async loadPublishedTemplates() {
    return this.database
      .select({ template: templates, version: templateVersions })
      .from(templates)
      .innerJoin(
        templateVersions,
        and(
          eq(templateVersions.templateId, templates.id),
          eq(templateVersions.version, templates.currentVersion),
        ),
      )
      .where(
        and(eq(templates.status, "PUBLISHED"), eq(templateVersions.status, "PUBLISHED")),
      );
  }

  async listTemplates(query: ListTemplatesQuery, memberId?: string) {
    const [catalogVersion, allRows, mappings, localizations] = await Promise.all([
      this.version(),
      this.loadPublishedTemplates(),
      this.database.select().from(templateScenes),
      this.database.select().from(templateVersionLocalizations),
    ]);

    let rows = allRows.filter(({ template }) => {
      const hasScene =
        !query.scene ||
        mappings.some(
          (mapping) => mapping.templateId === template.id && mapping.sceneKey === query.scene,
        );
      return (
        hasScene &&
        (!query.aspectRatio || template.supportedAspectRatios.includes(query.aspectRatio)) &&
        (!query.peopleCount || template.peopleCount === query.peopleCount)
      );
    });

    const orderValue = (row: TemplateRow): string | number => {
      if (query.sort === "popular") return row.template.likeCount;
      if (query.sort === "latest") return row.version.publishedAt!.toISOString();
      if (query.scene) {
        return (
          mappings.find(
            (mapping) =>
              mapping.templateId === row.template.id && mapping.sceneKey === query.scene,
          )?.sortOrder ?? row.template.sortOrder
        );
      }
      return row.template.sortOrder;
    };

    rows.sort((left, right) => {
      const a = orderValue(left);
      const b = orderValue(right);
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      const directed = query.sort === "recommended" ? comparison : -comparison;
      return directed || left.template.id.localeCompare(right.template.id);
    });

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor, query);
      const expectedType = query.sort === "latest" ? "string" : "number";
      if (typeof cursor.value !== expectedType) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_CURSOR",
          message: "Cursor is invalid for this catalog sort order",
        });
      }
      rows = rows.filter((row) => {
        const value = orderValue(row);
        if (value === cursor.value) return row.template.id > cursor.id;
        if (query.sort === "latest") {
          return String(value) < String(cursor.value);
        }
        return query.sort === "recommended"
          ? Number(value) > Number(cursor.value)
          : Number(value) < Number(cursor.value);
      });
    }

    const hasNext = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const states = await this.loadInteractionStates(
      memberId,
      pageRows.map((row) => row.template.id),
    );
    const items = pageRows.map((row) =>
      this.summary(row, mappings, localizations, query.locale, states),
    );
    const last = pageRows.at(-1);

    return {
      catalogVersion,
      items,
      nextCursor:
        hasNext && last
          ? encodeCursor({
              v: 1,
              sort: query.sort,
              filter: filterKey(query),
              value: orderValue(last),
              id: last.template.id,
            })
          : null,
      hasNext,
    };
  }

  async getTemplate(
    templateId: string,
    locale: string,
    requestedVersion?: number,
    memberId?: string,
  ) {
    const template = await this.database.query.templates.findFirst({
      where: and(eq(templates.id, templateId), eq(templates.status, "PUBLISHED")),
    });
    const versionNumber = requestedVersion ?? template?.currentVersion;
    if (!template || !versionNumber) return this.notFound();

    const [version, mappings, localizations, catalogVersion] = await Promise.all([
      this.database.query.templateVersions.findFirst({
        where: and(
          eq(templateVersions.templateId, templateId),
          eq(templateVersions.version, versionNumber),
          eq(templateVersions.status, "PUBLISHED"),
        ),
      }),
      this.database.select().from(templateScenes).where(eq(templateScenes.templateId, templateId)),
      this.database
        .select()
        .from(templateVersionLocalizations)
        .where(
          and(
            eq(templateVersionLocalizations.templateId, templateId),
            eq(templateVersionLocalizations.version, versionNumber),
          ),
        ),
      this.version(),
    ]);
    if (!version) return this.notFound();
    const localization = selectLocalization(localizations, locale);
    const states = await this.loadInteractionStates(memberId, [templateId]);

    return {
      catalogVersion,
      ...this.summary({ template, version }, mappings, localizations, locale, states),
      guide: {
        type: version.guideType,
        assetUrl: assetUrl(this.assetBaseUrl, version.guideAssetPath),
        ...version.guideConfig,
      },
      instructions: localization.instructions,
      publishedAt: version.publishedAt!.toISOString(),
    };
  }

  async listMemberTemplates(
    userId: string,
    kind: MemberCollectionKind,
    query: MemberCollectionQuery,
  ) {
    const cursor = query.cursor
      ? decodeCollectionCursor(query.cursor, userId, kind)
      : undefined;
    const relation = kind === "liked" ? templateLikes : templateBookmarks;
    const cursorCondition = cursor
      ? or(
          lt(relation.createdAt, new Date(cursor.createdAt)),
          and(
            eq(relation.createdAt, new Date(cursor.createdAt)),
            lt(relation.templateId, cursor.templateId),
          ),
        )
      : undefined;
    const relations = await this.database
      .select({ templateId: relation.templateId, createdAt: relation.createdAt })
      .from(relation)
      .innerJoin(templates, eq(templates.id, relation.templateId))
      .where(
        and(
          eq(relation.userId, userId),
          eq(templates.status, "PUBLISHED"),
          cursorCondition,
        ),
      )
      .orderBy(desc(relation.createdAt), desc(relation.templateId))
      .limit(query.limit + 1);

    const hasNext = relations.length > query.limit;
    const pageRelations = relations.slice(0, query.limit);
    const ids = pageRelations.map((item) => item.templateId);
    const [catalogVersion, allRows, mappings, localizations, states] = await Promise.all([
      this.version(),
      this.loadPublishedTemplates(),
      ids.length
        ? this.database.select().from(templateScenes).where(inArray(templateScenes.templateId, ids))
        : [],
      ids.length
        ? this.database
            .select()
            .from(templateVersionLocalizations)
            .where(inArray(templateVersionLocalizations.templateId, ids))
        : [],
      this.loadInteractionStates(userId, ids),
    ]);
    const rowsById = new Map(
      allRows
        .filter((row) => ids.includes(row.template.id))
        .map((row) => [row.template.id, row] as const),
    );
    const items = pageRelations.flatMap((relationRow) => {
      const row = rowsById.get(relationRow.templateId);
      return row ? [this.summary(row, mappings, localizations, query.locale, states)] : [];
    });
    const last = pageRelations.at(-1);

    return {
      catalogVersion,
      items,
      nextCursor:
        hasNext && last
          ? encodeCollectionCursor({
              v: 1,
              kind,
              userId,
              createdAt: last.createdAt.toISOString(),
              templateId: last.templateId,
            })
          : null,
      hasNext,
    };
  }

  private summary(
    row: TemplateRow,
    mappings: Array<typeof templateScenes.$inferSelect>,
    localizations: Array<typeof templateVersionLocalizations.$inferSelect>,
    locale: string,
    states: { liked: Set<string>; bookmarked: Set<string> } = {
      liked: new Set(),
      bookmarked: new Set(),
    },
  ) {
    const localization = selectLocalization(
      localizations.filter(
        (item) => item.templateId === row.template.id && item.version === row.version.version,
      ),
      locale,
    );
    return {
      id: row.template.id,
      version: row.version.version,
      title: localization.title,
      summary: localization.summary,
      sceneKeys: mappings
        .filter((mapping) => mapping.templateId === row.template.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((mapping) => mapping.sceneKey),
      thumbnailUrl: assetUrl(this.assetBaseUrl, row.version.thumbnailPath),
      previewUrl: assetUrl(this.assetBaseUrl, row.version.previewPath),
      supportedAspectRatios: row.template.supportedAspectRatios,
      peopleCount: row.template.peopleCount,
      likeCount: row.template.likeCount,
      liked: states.liked.has(row.template.id),
      bookmarked: states.bookmarked.has(row.template.id),
    };
  }

  private async loadInteractionStates(userId: string | undefined, templateIds: string[]) {
    if (!userId || templateIds.length === 0) {
      return { liked: new Set<string>(), bookmarked: new Set<string>() };
    }
    const [likes, bookmarks] = await Promise.all([
      this.database
        .select({ templateId: templateLikes.templateId })
        .from(templateLikes)
        .where(
          and(eq(templateLikes.userId, userId), inArray(templateLikes.templateId, templateIds)),
        ),
      this.database
        .select({ templateId: templateBookmarks.templateId })
        .from(templateBookmarks)
        .where(
          and(
            eq(templateBookmarks.userId, userId),
            inArray(templateBookmarks.templateId, templateIds),
          ),
        ),
    ]);
    return {
      liked: new Set(likes.map((item) => item.templateId)),
      bookmarked: new Set(bookmarks.map((item) => item.templateId)),
    };
  }

  private notFound(): never {
    throw new ApiError({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
      message: "Template was not found",
    });
  }
}
