CREATE TYPE "public"."photo_feedback_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "photo_feedbacks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"template_id" varchar(80) NOT NULL,
	"template_version" integer NOT NULL,
	"scene_analysis_id" uuid,
	"previous_feedback_id" uuid,
	"retake_index" integer DEFAULT 0 NOT NULL,
	"locale" varchar(35) NOT NULL,
	"capture" jsonb NOT NULL,
	"status" "photo_feedback_status" DEFAULT 'QUEUED' NOT NULL,
	"result" jsonb,
	"failure_code" varchar(64),
	"retryable" boolean,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "photo_feedbacks_retake_index_check" CHECK ("photo_feedbacks"."retake_index" between 0 and 100),
	CONSTRAINT "photo_feedbacks_attempts_check" CHECK ("photo_feedbacks"."attempt_count" between 0 and "photo_feedbacks"."max_attempts" and "photo_feedbacks"."max_attempts" between 1 and 10),
	CONSTRAINT "photo_feedbacks_lease_check" CHECK (("photo_feedbacks"."status" = 'PROCESSING' and "photo_feedbacks"."lease_owner" is not null and "photo_feedbacks"."lease_expires_at" is not null) or ("photo_feedbacks"."status" <> 'PROCESSING' and "photo_feedbacks"."lease_owner" is null and "photo_feedbacks"."lease_expires_at" is null)),
	CONSTRAINT "photo_feedbacks_capture_check" CHECK (jsonb_typeof("photo_feedbacks"."capture") = 'object'),
	CONSTRAINT "photo_feedbacks_cancelled_at_check" CHECK ("photo_feedbacks"."status" <> 'CANCELLED' or "photo_feedbacks"."cancelled_at" is not null),
	CONSTRAINT "photo_feedbacks_previous_check" CHECK ("photo_feedbacks"."previous_feedback_id" is null or "photo_feedbacks"."previous_feedback_id" <> "photo_feedbacks"."id")
);
--> statement-breakpoint
DROP INDEX "ai_job_attempts_scene_number_uidx";--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ALTER COLUMN "scene_analysis_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD COLUMN "photo_feedback_id" uuid;--> statement-breakpoint
ALTER TABLE "photo_feedbacks" ADD CONSTRAINT "photo_feedbacks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_feedbacks" ADD CONSTRAINT "photo_feedbacks_upload_id_image_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."image_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_feedbacks" ADD CONSTRAINT "photo_feedbacks_scene_analysis_id_scene_analyses_id_fk" FOREIGN KEY ("scene_analysis_id") REFERENCES "public"."scene_analyses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_feedbacks" ADD CONSTRAINT "photo_feedbacks_previous_feedback_id_photo_feedbacks_id_fk" FOREIGN KEY ("previous_feedback_id") REFERENCES "public"."photo_feedbacks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_feedbacks" ADD CONSTRAINT "photo_feedbacks_template_version_fk" FOREIGN KEY ("template_id","template_version") REFERENCES "public"."template_versions"("template_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_feedbacks_upload_uidx" ON "photo_feedbacks" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "photo_feedbacks_owner_created_idx" ON "photo_feedbacks" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "photo_feedbacks_status_created_idx" ON "photo_feedbacks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "photo_feedbacks_claim_idx" ON "photo_feedbacks" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "photo_feedbacks_expires_idx" ON "photo_feedbacks" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_photo_feedback_id_photo_feedbacks_id_fk" FOREIGN KEY ("photo_feedback_id") REFERENCES "public"."photo_feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempts_feedback_number_uidx" ON "ai_job_attempts" USING btree ("photo_feedback_id","attempt_number") WHERE "ai_job_attempts"."photo_feedback_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_job_attempts_feedback_started_idx" ON "ai_job_attempts" USING btree ("photo_feedback_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_attempts_scene_number_uidx" ON "ai_job_attempts" USING btree ("scene_analysis_id","attempt_number") WHERE "ai_job_attempts"."scene_analysis_id" is not null;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_parent_check" CHECK (num_nonnulls("ai_job_attempts"."scene_analysis_id", "ai_job_attempts"."photo_feedback_id") = 1);