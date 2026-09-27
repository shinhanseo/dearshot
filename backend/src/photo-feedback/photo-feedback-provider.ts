import { z } from "zod";
import type { CaptureMetadata } from "../db/schema/jobs.js";
import type { GuideConfig, TemplateInstruction } from "../db/schema/catalog.js";
import { SceneProviderError } from "../scene-analysis/scene-recommendation-provider.js";

export const feedbackCategories = ["COMPOSITION", "POSE", "LIGHTING", "EXPRESSION"] as const;
export const feedbackActionCodes = [
  "MOVE_SUBJECT_LEFT",
  "MOVE_SUBJECT_RIGHT",
  "MOVE_SUBJECT_UP",
  "MOVE_SUBJECT_DOWN",
  "STEP_CLOSER",
  "STEP_BACK",
  "STRAIGHTEN_HORIZON",
  "LOWER_CAMERA",
  "RAISE_CAMERA",
  "REDUCE_HEADROOM",
  "FACE_CAMERA",
  "RELAX_POSE",
  "IMPROVE_LIGHTING",
  "SOFTEN_EXPRESSION",
  "KEEP_CURRENT",
] as const;

export const actionCategory = {
  MOVE_SUBJECT_LEFT: "COMPOSITION",
  MOVE_SUBJECT_RIGHT: "COMPOSITION",
  MOVE_SUBJECT_UP: "COMPOSITION",
  MOVE_SUBJECT_DOWN: "COMPOSITION",
  STEP_CLOSER: "COMPOSITION",
  STEP_BACK: "COMPOSITION",
  STRAIGHTEN_HORIZON: "COMPOSITION",
  LOWER_CAMERA: "COMPOSITION",
  RAISE_CAMERA: "COMPOSITION",
  REDUCE_HEADROOM: "COMPOSITION",
  FACE_CAMERA: "POSE",
  RELAX_POSE: "POSE",
  IMPROVE_LIGHTING: "LIGHTING",
  SOFTEN_EXPRESSION: "EXPRESSION",
  KEEP_CURRENT: "COMPOSITION",
} as const satisfies Record<typeof feedbackActionCodes[number], typeof feedbackCategories[number]>;

export const actionMessageKeys = Object.fromEntries(
  feedbackActionCodes.map((code) => [code, `feedback.${code.toLowerCase()}`]),
) as Record<typeof feedbackActionCodes[number], string>;

export const photoFeedbackDecisionSchema = z.object({
  category: z.enum(feedbackCategories),
  actionCode: z.enum(feedbackActionCodes),
  strength: z.enum(["SMALL", "MEDIUM"]),
  confidence: z.number().min(0).max(1),
  improvedFromPrevious: z.boolean().nullable(),
}).strict();

export type PhotoFeedbackProviderInput = {
  image: Buffer;
  contentType: string;
  locale: string;
  capture: CaptureMetadata;
  template: {
    id: string;
    version: number;
    title: string;
    summary: string;
    guideConfig: GuideConfig;
    instructions: TemplateInstruction[];
  };
  previous: {
    actionCode: string;
    category: string;
    retakeIndex: number;
  } | null;
};

export type PhotoFeedbackProviderResult = {
  decision: z.infer<typeof photoFeedbackDecisionSchema>;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export interface PhotoFeedbackProvider {
  readonly providerName: string;
  readonly modelName: string;
  evaluate(input: PhotoFeedbackProviderInput, signal: AbortSignal): Promise<PhotoFeedbackProviderResult>;
}

export class MockPhotoFeedbackProvider implements PhotoFeedbackProvider {
  readonly providerName = "mock";
  readonly modelName = "deterministic-b17";

  async evaluate(input: PhotoFeedbackProviderInput, signal: AbortSignal): Promise<PhotoFeedbackProviderResult> {
    signal.throwIfAborted();
    return {
      decision: {
        category: "COMPOSITION",
        actionCode: input.previous ? "KEEP_CURRENT" : "MOVE_SUBJECT_LEFT",
        strength: "SMALL",
        confidence: 0.9,
        improvedFromPrevious: input.previous ? true : null,
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export { SceneProviderError as PhotoFeedbackProviderError };
