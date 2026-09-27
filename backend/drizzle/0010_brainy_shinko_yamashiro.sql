CREATE TYPE "public"."ai_job_attempt_status" AS ENUM('STARTED', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "ai_job_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scene_analysis_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"model" varchar(80) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"schema_version" varchar(32) NOT NULL,
	"status" "ai_job_attempt_status" DEFAULT 'STARTED' NOT NULL,
	"failure_phase" varchar(32),
	"error_code" varchar(64),
	"provider_status_code" integer,
	"retryable" boolean,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_job_attempts_number_check" CHECK ("ai_job_attempts"."attempt_number" > 0),
	CONSTRAINT "ai_job_attempts_latency_check" CHECK ("ai_job_attempts"."latency_ms" is null or "ai_job_attempts"."latency_ms" >= 0),
	CONSTRAINT "ai_job_attempts_input_tokens_check" CHECK ("ai_job_attempts"."input_tokens" is null or "ai_job_attempts"."input_tokens" >= 0),
	CONSTRAINT "ai_job_attempts_output_tokens_check" CHECK ("ai_job_attempts"."output_tokens" is null or "ai_job_attempts"."output_tokens" >= 0),
	CONSTRAINT "ai_job_attempts_completion_check" CHECK (("ai_job_attempts"."status" = 'STARTED' and "ai_job_attempts"."completed_at" is null) or ("ai_job_attempts"."status" <> 'STARTED' and "ai_job_attempts"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_scene_analysis_id_scene_analyses_id_fk" FOREIGN KEY ("scene_analysis_id") REFERENCES "public"."scene_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempts_scene_number_uidx" ON "ai_job_attempts" USING btree ("scene_analysis_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempts_request_uidx" ON "ai_job_attempts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ai_job_attempts_scene_started_idx" ON "ai_job_attempts" USING btree ("scene_analysis_id","started_at");