import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  scenes,
  templateScenes,
  templateVersionLocalizations,
  templateVersions,
  templates,
} from "../db/schema/catalog.js";
import type { DeviceAnalysisSnapshot } from "../db/schema/jobs.js";
import type { RecommendationCandidate } from "./scene-recommendation-provider.js";

const places365SceneMapping: Record<string, string[]> = {
  bookstore: ["library"],
  library_indoor: ["library"],
  art_gallery: ["museum"],
  museum_indoor: ["museum"],
  greenhouse_indoor: ["greenhouse"],
  beach: ["waterfront"],
  coast: ["waterfront"],
  ocean: ["waterfront"],
  wave: ["waterfront"],
  lake_natural: ["waterfront"],
  river: ["waterfront"],
  lagoon: ["waterfront"],
  harbor: ["waterfront"],
  pier: ["waterfront"],
  coffee_shop: ["cafe"],
  ice_cream_parlor: ["cafe"],
  restaurant: ["cafe"],
  restaurant_patio: ["cafe"],
  diner_outdoor: ["cafe"],
  park: ["green-space"],
  botanical_garden: ["green-space"],
  formal_garden: ["green-space"],
  japanese_garden: ["green-space"],
  zen_garden: ["green-space"],
  topiary_garden: ["green-space"],
  lawn: ["green-space"],
  yard: ["green-space"],
  forest_broadleaf: ["green-space"],
  forest_path: ["green-space"],
  forest_road: ["green-space"],
  bamboo_forest: ["green-space"],
  rainforest: ["green-space"],
  orchard: ["green-space"],
  picnic_area: ["green-space"],
  street: ["urban-street"],
  crosswalk: ["urban-street"],
  alley: ["urban-street"],
  plaza: ["urban-street"],
  campus: ["urban-street"],
  downtown: ["urban-street"],
  building_facade: ["urban-street"],
  shopfront: ["urban-street"],
  residential_neighborhood: ["urban-street"],
  apartment_building_outdoor: ["urban-street"],
  office_building: ["urban-street"],
};

export type CandidateQuery = {
  locale: string;
  imageWidth: number;
  imageHeight: number;
  deviceAnalysis: DeviceAnalysisSnapshot | null;
};

export class SceneTemplateCandidateService {
  constructor(
    private readonly database: Database,
    private readonly maximumCandidates: number,
  ) {}

  async find(query: CandidateQuery): Promise<RecommendationCandidate[]> {
    const rows = await this.database
      .select({
        templateId: templates.id,
        templateVersion: templateVersions.version,
        peopleCount: templates.peopleCount,
        aspectRatios: templates.supportedAspectRatios,
        sceneKey: templateScenes.sceneKey,
        templateSortOrder: templates.sortOrder,
        sceneSortOrder: templateScenes.sortOrder,
      })
      .from(templates)
      .innerJoin(
        templateVersions,
        and(
          eq(templateVersions.templateId, templates.id),
          eq(templateVersions.version, templates.currentVersion),
          eq(templateVersions.status, "PUBLISHED"),
        ),
      )
      .innerJoin(templateScenes, eq(templateScenes.templateId, templates.id))
      .innerJoin(scenes, and(eq(scenes.key, templateScenes.sceneKey), eq(scenes.active, true)))
      .where(eq(templates.status, "PUBLISHED"))
      .orderBy(asc(templates.sortOrder), asc(templateScenes.sortOrder), asc(templates.id))
      .limit(500);

    const grouped = new Map<string, {
      templateId: string;
      templateVersion: number;
      peopleCount: number;
      aspectRatios: string[];
      sceneKeys: string[];
      order: number;
    }>();
    rows.forEach((row, index) => {
      const existing = grouped.get(row.templateId);
      if (existing) {
        existing.sceneKeys.push(row.sceneKey);
      } else {
        grouped.set(row.templateId, {
          templateId: row.templateId,
          templateVersion: row.templateVersion,
          peopleCount: row.peopleCount,
          aspectRatios: row.aspectRatios,
          sceneKeys: [row.sceneKey],
          order: index,
        });
      }
    });

    const mappedScenes = mapPlaces365Scenes(query.deviceAnalysis);
    const detectedPeople = query.deviceAnalysis?.objectDetector?.objects
      .filter((object) => object.label.trim().toLowerCase() === "person").length ?? 0;
    const aspectRatio = nearestAspectRatio(query.imageWidth, query.imageHeight);
    const ranked = [...grouped.values()].map((candidate) => ({
      candidate,
      score:
        (candidate.sceneKeys.some((key) => mappedScenes.has(key)) ? 100 : 0) +
        (detectedPeople > 0 && candidate.peopleCount === detectedPeople ? 20 : 0) +
        (candidate.aspectRatios.includes(aspectRatio) ? 10 : 0),
    })).sort((left, right) => right.score - left.score || left.candidate.order - right.candidate.order);

    const selected = ranked.slice(0, this.maximumCandidates).map(({ candidate }) => candidate);
    if (selected.length === 0) return [];
    const ids = selected.map((candidate) => candidate.templateId);
    const localizations = await this.database
      .select()
      .from(templateVersionLocalizations)
      .where(and(
        inArray(templateVersionLocalizations.templateId, ids),
        inArray(templateVersionLocalizations.locale, [...new Set([query.locale, "en-US"])]),
      ));

    return selected.map((candidate) => {
      const matching = localizations.filter((localization) =>
        localization.templateId === candidate.templateId &&
        localization.version === candidate.templateVersion
      );
      const localization = matching.find((item) => item.locale === query.locale)
        ?? matching.find((item) => item.locale === "en-US");
      return {
        templateId: candidate.templateId,
        templateVersion: candidate.templateVersion,
        sceneKeys: [...new Set(candidate.sceneKeys)],
        peopleCount: candidate.peopleCount,
        aspectRatios: candidate.aspectRatios,
        title: localization?.title ?? candidate.templateId,
        summary: localization?.summary ?? "",
      };
    });
  }
}

export function mapPlaces365Scenes(deviceAnalysis: DeviceAnalysisSnapshot | null): Set<string> {
  const mapped = new Set<string>();
  for (const candidate of deviceAnalysis?.sceneClassifier?.candidates ?? []) {
    const normalized = candidate.label.trim().toLowerCase().replaceAll("/", "_").replaceAll(" ", "_");
    for (const sceneKey of places365SceneMapping[normalized] ?? []) mapped.add(sceneKey);
  }
  return mapped;
}

function nearestAspectRatio(width: number, height: number): "4:3" | "9:16" | "1:1" {
  const ratio = width / height;
  const options = [
    { value: "4:3" as const, ratio: width >= height ? 4 / 3 : 3 / 4 },
    { value: "9:16" as const, ratio: width >= height ? 16 / 9 : 9 / 16 },
    { value: "1:1" as const, ratio: 1 },
  ];
  return options.sort((left, right) =>
    Math.abs(Math.log(ratio / left.ratio)) - Math.abs(Math.log(ratio / right.ratio))
  )[0].value;
}
