import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  catalogState,
  sceneLocalizations,
  scenes,
  templateScenes,
  templateVersionLocalizations,
  templateVersions,
  templates,
} from "../db/schema/catalog.js";
import type { CatalogManifest } from "./manifest.js";
import { validateCatalogAssets } from "./manifest.js";

type ImportOptions = { assetRoot: string };

export async function importCatalog(
  database: Database,
  manifest: CatalogManifest,
  { assetRoot }: ImportOptions,
): Promise<void> {
  await validateCatalogAssets(manifest, assetRoot);

  await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('dearshot-catalog-import'))`);

    for (const scene of manifest.scenes) {
      await transaction
        .insert(scenes)
        .values({
          key: scene.key,
          active: scene.active,
          thumbnailPath: scene.thumbnailPath,
          sortOrder: scene.sortOrder,
        })
        .onConflictDoUpdate({
          target: scenes.key,
          set: {
            active: scene.active,
            thumbnailPath: scene.thumbnailPath,
            sortOrder: scene.sortOrder,
          },
        });
      for (const [locale, localization] of Object.entries(scene.localizations)) {
        await transaction
          .insert(sceneLocalizations)
          .values({ sceneKey: scene.key, locale, displayName: localization.displayName })
          .onConflictDoUpdate({
            target: [sceneLocalizations.sceneKey, sceneLocalizations.locale],
            set: { displayName: localization.displayName },
          });
      }
    }

    for (const template of manifest.templates) {
      await transaction
        .insert(templates)
        .values({
          id: template.id,
          peopleCount: template.peopleCount,
          supportedAspectRatios: template.supportedAspectRatios,
          sortOrder: template.sortOrder,
        })
        .onConflictDoUpdate({
          target: templates.id,
          set: {
            peopleCount: template.peopleCount,
            supportedAspectRatios: template.supportedAspectRatios,
            sortOrder: template.sortOrder,
          },
        });

      await transaction.delete(templateScenes).where(eq(templateScenes.templateId, template.id));
      await transaction.insert(templateScenes).values(
        template.scenes.map((scene) => ({
          templateId: template.id,
          sceneKey: scene.key,
          sortOrder: scene.sortOrder,
        })),
      );

      for (const version of template.versions) {
        const existing = await transaction.query.templateVersions.findFirst({
          where: and(
            eq(templateVersions.templateId, template.id),
            eq(templateVersions.version, version.version),
          ),
        });
        const localizations = Object.entries(version.localizations).map(([locale, value]) => ({
          templateId: template.id,
          version: version.version,
          locale,
          ...value,
        }));

        if (existing?.status === "PUBLISHED") {
          const storedLocalizations = await transaction
            .select()
            .from(templateVersionLocalizations)
            .where(
              and(
                eq(templateVersionLocalizations.templateId, template.id),
                eq(templateVersionLocalizations.version, version.version),
              ),
            );
          const expected = {
            previewPath: version.previewPath,
            thumbnailPath: version.thumbnailPath,
            guideType: version.guide.type,
            guideAssetPath: version.guide.assetPath,
            guideConfig: version.guide.config,
            publishedAt: new Date(version.publishedAt).toISOString(),
            localizations: localizations
              .map(({ locale, title, summary, instructions }) => ({ locale, title, summary, instructions }))
              .sort((a, b) => a.locale.localeCompare(b.locale)),
          };
          const actual = {
            previewPath: existing.previewPath,
            thumbnailPath: existing.thumbnailPath,
            guideType: existing.guideType,
            guideAssetPath: existing.guideAssetPath,
            guideConfig: existing.guideConfig,
            publishedAt: existing.publishedAt?.toISOString(),
            localizations: storedLocalizations
              .map(({ locale, title, summary, instructions }) => ({ locale, title, summary, instructions }))
              .sort((a, b) => a.locale.localeCompare(b.locale)),
          };
          if (!isDeepStrictEqual(actual, expected)) {
            throw new Error(`Published template version cannot be changed: ${template.id}@${version.version}`);
          }
          continue;
        }

        if (existing) {
          await transaction
            .update(templateVersions)
            .set({
              previewPath: version.previewPath,
              thumbnailPath: version.thumbnailPath,
              guideType: version.guide.type,
              guideAssetPath: version.guide.assetPath,
              guideConfig: version.guide.config,
              publishedAt: new Date(version.publishedAt),
            })
            .where(
              and(
                eq(templateVersions.templateId, template.id),
                eq(templateVersions.version, version.version),
              ),
            );
          await transaction
            .delete(templateVersionLocalizations)
            .where(
              and(
                eq(templateVersionLocalizations.templateId, template.id),
                eq(templateVersionLocalizations.version, version.version),
              ),
            );
        } else {
          await transaction.insert(templateVersions).values({
            templateId: template.id,
            version: version.version,
            previewPath: version.previewPath,
            thumbnailPath: version.thumbnailPath,
            guideType: version.guide.type,
            guideAssetPath: version.guide.assetPath,
            guideConfig: version.guide.config,
            publishedAt: new Date(version.publishedAt),
          });
        }
        await transaction.insert(templateVersionLocalizations).values(localizations);
        await transaction
          .update(templateVersions)
          .set({ status: "PUBLISHED" })
          .where(
            and(
              eq(templateVersions.templateId, template.id),
              eq(templateVersions.version, version.version),
            ),
          );
      }

      assert(template.versions.some((version) => version.version === template.currentVersion));
      await transaction
        .update(templates)
        .set({ status: "PUBLISHED", currentVersion: template.currentVersion })
        .where(eq(templates.id, template.id));
    }

    const existingState = await transaction.query.catalogState.findFirst({
      where: eq(catalogState.id, "current"),
    });
    if (!existingState) {
      await transaction.insert(catalogState).values({
        id: "current",
        catalogVersion: manifest.catalogVersion,
      });
    } else if (existingState.catalogVersion !== manifest.catalogVersion) {
      await transaction
        .update(catalogState)
        .set({ catalogVersion: manifest.catalogVersion, importedAt: new Date() })
        .where(eq(catalogState.id, "current"));
    }
  });
}
