import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u);
const labelSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9 _/-]*$/u);
const confidenceSchema = z.number().finite().min(0).max(1);
const boxSchema = z.object({
  left: z.number().finite().min(0).max(1), top: z.number().finite().min(0).max(1),
  right: z.number().finite().min(0).max(1), bottom: z.number().finite().min(0).max(1),
}).strict().refine((box) => box.left < box.right && box.top < box.bottom, {
  message: "Bounding box must have positive width and height",
});
const modelMetadata = { model: identifierSchema, modelVersion: identifierSchema, runtime: identifierSchema };

export const deviceAnalysisSchema = z.object({
  sceneClassifier: z.object({
    ...modelMetadata,
    candidates: z.array(z.object({ label: labelSchema, confidence: confidenceSchema }).strict()).max(5),
  }).strict().optional(),
  objectDetector: z.object({
    ...modelMetadata,
    objects: z.array(z.object({ label: labelSchema, confidence: confidenceSchema, box: boxSchema }).strict()).max(20),
  }).strict().optional(),
}).strict().refine((analysis) => analysis.sceneClassifier || analysis.objectDetector, {
  message: "At least one on-device analysis result is required",
});

const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(100_000).optional(),
}).strict();
const timezoneSchema = z.string().trim().min(1).max(64).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Timezone must be a valid IANA timezone");

export const createSceneAnalysisSchema = z.object({
  uploadId: z.uuid(),
  sceneRevision: z.number().int().min(0).max(2_147_483_647),
  capturedAt: z.iso.datetime({ offset: true }),
  locale: z.string().trim().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u),
  deviceAnalysis: deviceAnalysisSchema.optional(),
  context: z.object({ timezone: timezoneSchema.optional(), location: locationSchema.optional() }).strict().optional(),
}).strict();

export type CreateSceneAnalysisRequest = z.infer<typeof createSceneAnalysisSchema>;
