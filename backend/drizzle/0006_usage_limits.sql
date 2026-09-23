CREATE TYPE "public"."idempotency_status" AS ENUM('IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "daily_usage" (
	"user_id" uuid NOT NULL,
	"usage_date" date NOT NULL,
	"scene_analysis_count" integer DEFAULT 0 NOT NULL,
	"photo_feedback_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_usage_user_id_usage_date_pk" PRIMARY KEY("user_id","usage_date"),
	CONSTRAINT "daily_usage_nonnegative_check" CHECK ("daily_usage"."scene_analysis_count" >= 0 and "daily_usage"."photo_feedback_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" varchar(192) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" "idempotency_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_hash_check" CHECK ("idempotency_records"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_records_completed_check" CHECK ("idempotency_records"."status" <> 'COMPLETED' or ("idempotency_records"."response_status" is not null and "idempotency_records"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_principal_scope_key_uidx" ON "idempotency_records" USING btree ("user_id","scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_records_expires_idx" ON "idempotency_records" USING btree ("expires_at");