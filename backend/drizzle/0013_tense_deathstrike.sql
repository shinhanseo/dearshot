CREATE TYPE "public"."account_deletion_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "account_deletion_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_deletion_requests_attempt_check" CHECK ("account_deletion_requests"."attempt_count" >= 0),
	CONSTRAINT "account_deletion_requests_lease_check" CHECK (("account_deletion_requests"."status" = 'PROCESSING' and "account_deletion_requests"."lease_owner" is not null and "account_deletion_requests"."lease_expires_at" is not null) or ("account_deletion_requests"."status" <> 'PROCESSING' and "account_deletion_requests"."lease_owner" is null and "account_deletion_requests"."lease_expires_at" is null)),
	CONSTRAINT "account_deletion_requests_completion_check" CHECK (("account_deletion_requests"."status" = 'COMPLETED' and "account_deletion_requests"."completed_at" is not null) or ("account_deletion_requests"."status" <> 'COMPLETED' and "account_deletion_requests"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "ai_job_attempts" DROP CONSTRAINT "ai_job_attempts_parent_check";--> statement-breakpoint
ALTER TABLE "ai_job_attempts" DROP CONSTRAINT "ai_job_attempts_scene_analysis_id_scene_analyses_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_job_attempts" DROP CONSTRAINT "ai_job_attempts_photo_feedback_id_photo_feedbacks_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
UPDATE "ai_job_attempts" AS attempt
SET "owner_user_id" = coalesce(
	(SELECT analysis."owner_user_id" FROM "scene_analyses" AS analysis WHERE analysis."id" = attempt."scene_analysis_id"),
	(SELECT feedback."owner_user_id" FROM "photo_feedbacks" AS feedback WHERE feedback."id" = attempt."photo_feedback_id")
);--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ALTER COLUMN "owner_user_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_requests_user_uidx" ON "account_deletion_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_claim_idx" ON "account_deletion_requests" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_expires_idx" ON "account_deletion_requests" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_scene_analysis_id_scene_analyses_id_fk" FOREIGN KEY ("scene_analysis_id") REFERENCES "public"."scene_analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_photo_feedback_id_photo_feedbacks_id_fk" FOREIGN KEY ("photo_feedback_id") REFERENCES "public"."photo_feedbacks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_job_attempts_owner_started_idx" ON "ai_job_attempts" USING btree ("owner_user_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_job_attempts_started_idx" ON "ai_job_attempts" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "ai_job_attempts" ADD CONSTRAINT "ai_job_attempts_parent_check" CHECK (num_nonnulls("ai_job_attempts"."scene_analysis_id", "ai_job_attempts"."photo_feedback_id") = 1 or (num_nonnulls("ai_job_attempts"."scene_analysis_id", "ai_job_attempts"."photo_feedback_id") = 0 and "ai_job_attempts"."status" <> 'STARTED' and "ai_job_attempts"."completed_at" is not null));
