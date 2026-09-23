CREATE TYPE "public"."app_event_name" AS ENUM('scene_analysis_requested', 'scene_analysis_completed', 'scene_analysis_failed', 'template_selected', 'capture_completed', 'feedback_requested', 'feedback_completed', 'feedback_failed', 'retake_started', 'photo_saved', 'login_prompt_shown', 'login_prompt_completed');--> statement-breakpoint
CREATE TABLE "app_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" "account_type" NOT NULL,
	"session_id" uuid NOT NULL,
	"event_name" "app_event_name" NOT NULL,
	"app_version" varchar(32) NOT NULL,
	"os_version" varchar(32) NOT NULL,
	"locale" varchar(35) NOT NULL,
	"properties" jsonb NOT NULL,
	"request_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "app_events_properties_object_check" CHECK (jsonb_typeof("app_events"."properties") = 'object'),
	CONSTRAINT "app_events_expiry_check" CHECK ("app_events"."expires_at" > "app_events"."received_at")
);
--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_events_actor_event_uidx" ON "app_events" USING btree ("actor_id","event_id");--> statement-breakpoint
CREATE INDEX "app_events_name_occurred_idx" ON "app_events" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "app_events_actor_occurred_idx" ON "app_events" USING btree ("actor_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "app_events_expires_idx" ON "app_events" USING btree ("expires_at");