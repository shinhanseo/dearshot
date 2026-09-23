import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(96);
const durationMs = z.number().int().min(0).max(600_000);
const templateReference = {
  templateId: slug,
  templateVersion: z.number().int().min(1).max(1_000_000),
};
const failureCode = z.enum([
  "invalid_image",
  "upload_expired",
  "network",
  "provider_timeout",
  "provider_unavailable",
  "unknown",
]);
const captureSource = z.enum(["camera", "gallery"]);
const loginTrigger = z.enum(["save_photo", "bookmark", "settings"]);

const eventBase = {
  eventId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
};

export const appEventSchema = z.discriminatedUnion("eventName", [
  z.strictObject({
    ...eventBase,
    eventName: z.literal("scene_analysis_requested"),
    properties: z.strictObject({ source: captureSource }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("scene_analysis_completed"),
    properties: z.strictObject({ analysisId: z.uuid(), durationMs }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("scene_analysis_failed"),
    properties: z.strictObject({
      analysisId: z.uuid().optional(),
      failureCode,
      retryable: z.boolean(),
    }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("template_selected"),
    properties: z.strictObject({ ...templateReference, sceneKey: slug }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("capture_completed"),
    properties: z.strictObject({
      ...templateReference,
      retakeIndex: z.number().int().min(0).max(20),
    }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("feedback_requested"),
    properties: z.strictObject({ source: captureSource }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("feedback_completed"),
    properties: z.strictObject({ feedbackId: z.uuid(), durationMs }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("feedback_failed"),
    properties: z.strictObject({
      feedbackId: z.uuid().optional(),
      failureCode,
      retryable: z.boolean(),
    }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("retake_started"),
    properties: z.strictObject({
      feedbackId: z.uuid().optional(),
      reason: z.enum(["composition", "pose", "lighting", "expression", "other"]),
    }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("photo_saved"),
    properties: z.strictObject({ ...templateReference, hadFeedback: z.boolean() }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("login_prompt_shown"),
    properties: z.strictObject({ trigger: loginTrigger }),
  }),
  z.strictObject({
    ...eventBase,
    eventName: z.literal("login_prompt_completed"),
    properties: z.strictObject({ trigger: loginTrigger, provider: z.enum(["google", "kakao"]) }),
  }),
]);

export const appEventBatchSchema = z.strictObject({
  sessionId: z.uuid(),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/u).max(32),
  osVersion: z.string().regex(/^\d+(?:\.\d+){0,2}$/u).max(32),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u).max(35),
  events: z.array(appEventSchema).min(1).max(50),
});

export type AppEventBatch = z.infer<typeof appEventBatchSchema>;
