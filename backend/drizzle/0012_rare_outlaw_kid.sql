DROP TABLE "scene_analysis_events" CASCADE;--> statement-breakpoint
ALTER TABLE "scene_analyses" DROP COLUMN "events_expires_at";--> statement-breakpoint
DROP TYPE "public"."scene_analysis_event_type";