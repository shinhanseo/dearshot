CREATE TYPE "public"."scene_analysis_event_type" AS ENUM('status', 'recommendation', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "scene_analysis_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"analysis_id" uuid NOT NULL,
	"event_type" "scene_analysis_event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scene_analysis_events_payload_check" CHECK (jsonb_typeof("scene_analysis_events"."payload") = 'object')
);
--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "lease_owner" varchar(128);--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD COLUMN "events_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "scene_analyses" SET "status" = 'QUEUED', "next_attempt_at" = now(), "updated_at" = now() WHERE "status" = 'PROCESSING';--> statement-breakpoint
ALTER TABLE "scene_analysis_events" ADD CONSTRAINT "scene_analysis_events_analysis_id_scene_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."scene_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_analysis_events_analysis_id_idx" ON "scene_analysis_events" USING btree ("analysis_id","id");--> statement-breakpoint
CREATE INDEX "scene_analysis_events_expires_idx" ON "scene_analysis_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "scene_analyses_claim_idx" ON "scene_analyses" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD CONSTRAINT "scene_analyses_attempts_check" CHECK ("scene_analyses"."attempt_count" between 0 and "scene_analyses"."max_attempts" and "scene_analyses"."max_attempts" between 1 and 10);--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD CONSTRAINT "scene_analyses_lease_check" CHECK (("scene_analyses"."status" = 'PROCESSING' and "scene_analyses"."lease_owner" is not null and "scene_analyses"."lease_expires_at" is not null) or ("scene_analyses"."status" <> 'PROCESSING' and "scene_analyses"."lease_owner" is null and "scene_analyses"."lease_expires_at" is null));
