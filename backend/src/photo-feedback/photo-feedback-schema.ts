import { z } from "zod";

export const createPhotoFeedbackSchema = z.object({
  uploadId: z.uuid(),
  analysisId: z.uuid().nullable().optional(),
  previousFeedbackId: z.uuid().nullable().optional(),
  locale: z.string().trim().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u),
  template: z.object({
    id: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    version: z.number().int().positive(),
  }).strict(),
  capture: z.object({
    aspectRatio: z.enum(["4:3", "9:16", "1:1"]),
    orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
    guideEnabled: z.boolean(),
  }).strict(),
}).strict();

export type CreatePhotoFeedbackRequest = z.infer<typeof createPhotoFeedbackSchema>;
