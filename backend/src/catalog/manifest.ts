import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const assetPathSchema = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !path.posix.isAbsolute(value), "asset path must be relative")
  .refine((value) => !value.includes("\\"), "asset path must use forward slashes")
  .refine(
    (value) => !value.split("/").some((part) => part === ".." || part === "." || part === ""),
    "asset path contains an unsafe segment",
  )
  .refine(
    (value) => [".svg", ".webp", ".png", ".jpg", ".jpeg"].includes(path.extname(value).toLowerCase()),
    "asset type is not supported",
  );

const localeSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/u);
const localizationsSchema = <T extends z.ZodType>(value: T) =>
  z.record(localeSchema, value).refine((items) => "en-US" in items, "en-US fallback is required");

const guideConfigSchema = z.object({
  coordinateSpace: z.literal("NORMALIZED"),
  referenceWidth: z.number().int().positive(),
  referenceHeight: z.number().int().positive(),
  safeArea: z
    .object({
      left: z.number().min(0).max(1),
      top: z.number().min(0).max(1),
      right: z.number().min(0).max(1),
      bottom: z.number().min(0).max(1),
    })
    .refine((area) => area.left < area.right && area.top < area.bottom, "safe area is inverted"),
});

const instructionSchema = z.object({ order: z.number().int().positive(), text: z.string().min(1) });

export const catalogManifestSchema = z
  .object({
    catalogVersion: z.string().min(1).max(64),
    scenes: z.array(
      z.object({
        key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(64),
        active: z.boolean(),
        thumbnailPath: assetPathSchema,
        sortOrder: z.number().int().min(0),
        localizations: localizationsSchema(z.object({ displayName: z.string().min(1).max(100) })),
      }),
    ),
    templates: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
        peopleCount: z.number().int().min(1).max(10),
        supportedAspectRatios: z.array(z.enum(["4:3", "9:16", "1:1"])).min(1),
        sortOrder: z.number().int().min(0),
        scenes: z.array(
          z.object({ key: z.string().min(1).max(64), sortOrder: z.number().int().min(0) }),
        ).min(1),
        versions: z.array(
          z.object({
            version: z.number().int().positive(),
            previewPath: assetPathSchema,
            thumbnailPath: assetPathSchema,
            guide: z.object({
              type: z.enum(["SVG_OVERLAY", "RASTER_OVERLAY"]),
              assetPath: assetPathSchema,
              config: guideConfigSchema,
            }),
            publishedAt: z.iso.datetime({ offset: true }),
            localizations: localizationsSchema(
              z.object({
                title: z.string().min(1).max(120),
                summary: z.string().min(1).max(500),
                instructions: z.array(instructionSchema).min(1).max(10),
              }),
            ),
          }),
        ).min(1),
        currentVersion: z.number().int().positive(),
      }),
    ),
  })
  .superRefine((manifest, context) => {
    const unique = (values: Array<string | number>, pathPrefix: Array<string | number>) => {
      values.forEach((value, index) => {
        if (values.indexOf(value) !== index) {
          context.addIssue({ code: "custom", path: [...pathPrefix, index], message: "must be unique" });
        }
      });
    };
    unique(manifest.scenes.map((scene) => scene.key), ["scenes"]);
    unique(manifest.templates.map((template) => template.id), ["templates"]);
    const sceneKeys = new Set(manifest.scenes.map((scene) => scene.key));
    manifest.templates.forEach((template, templateIndex) => {
      unique(template.supportedAspectRatios, ["templates", templateIndex, "supportedAspectRatios"]);
      unique(template.versions.map((version) => version.version), ["templates", templateIndex, "versions"]);
      unique(template.scenes.map((scene) => scene.key), ["templates", templateIndex, "scenes"]);
      if (!template.versions.some((version) => version.version === template.currentVersion)) {
        context.addIssue({
          code: "custom",
          path: ["templates", templateIndex, "currentVersion"],
          message: "must reference a version in this template",
        });
      }
      template.scenes.forEach((scene, sceneIndex) => {
        if (!sceneKeys.has(scene.key)) {
          context.addIssue({
            code: "custom",
            path: ["templates", templateIndex, "scenes", sceneIndex, "key"],
            message: "must reference a scene in this manifest",
          });
        }
      });
      template.versions.forEach((version, versionIndex) => {
        Object.entries(version.localizations).forEach(([locale, localization]) => {
          unique(
            localization.instructions.map((instruction) => instruction.order),
            ["templates", templateIndex, "versions", versionIndex, "localizations", locale, "instructions"],
          );
        });
      });
    });
  });

export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

export async function readCatalogManifest(manifestPath: string): Promise<CatalogManifest> {
  const source = await readFile(manifestPath, "utf8");
  return catalogManifestSchema.parse(JSON.parse(source));
}

export function listAssetPaths(manifest: CatalogManifest): string[] {
  return [
    ...manifest.scenes.map((scene) => scene.thumbnailPath),
    ...manifest.templates.flatMap((template) =>
      template.versions.flatMap((version) => [
        version.previewPath,
        version.thumbnailPath,
        version.guide.assetPath,
      ]),
    ),
  ];
}

export async function validateCatalogAssets(manifest: CatalogManifest, assetRoot: string) {
  const canonicalRoot = await realpath(assetRoot);
  for (const relativePath of new Set(listAssetPaths(manifest))) {
    const candidate = path.resolve(canonicalRoot, relativePath);
    const canonicalFile = await realpath(candidate).catch(() => undefined);
    if (!canonicalFile || !canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) {
      throw new Error(`Catalog asset is missing or unsafe: ${relativePath}`);
    }
    const metadata = await stat(canonicalFile);
    if (!metadata.isFile()) throw new Error(`Catalog asset is not a file: ${relativePath}`);
  }
}
