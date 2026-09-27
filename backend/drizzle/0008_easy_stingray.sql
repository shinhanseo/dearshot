CREATE TYPE "public"."scene_analysis_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'NEEDS_USER_SELECTION', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "scene_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"status" "scene_analysis_status" DEFAULT 'QUEUED' NOT NULL,
	"scene_revision" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"locale" varchar(35) NOT NULL,
	"device_analysis" jsonb,
	"timezone" varchar(64),
	"latitude" double precision,
	"longitude" double precision,
	"location_accuracy_meters" double precision,
	"result" jsonb,
	"failure_code" varchar(64),
	"retryable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scene_analyses_revision_check" CHECK ("scene_analyses"."scene_revision" >= 0),
	CONSTRAINT "scene_analyses_location_pair_check" CHECK (("scene_analyses"."latitude" is null and "scene_analyses"."longitude" is null) or ("scene_analyses"."latitude" is not null and "scene_analyses"."longitude" is not null)),
	CONSTRAINT "scene_analyses_latitude_check" CHECK ("scene_analyses"."latitude" is null or "scene_analyses"."latitude" between -90 and 90),
	CONSTRAINT "scene_analyses_longitude_check" CHECK ("scene_analyses"."longitude" is null or "scene_analyses"."longitude" between -180 and 180),
	CONSTRAINT "scene_analyses_accuracy_check" CHECK ("scene_analyses"."location_accuracy_meters" is null or "scene_analyses"."location_accuracy_meters" >= 0),
	CONSTRAINT "scene_analyses_device_analysis_check" CHECK ("scene_analyses"."device_analysis" is null or jsonb_typeof("scene_analyses"."device_analysis") = 'object'),
	CONSTRAINT "scene_analyses_cancelled_at_check" CHECK ("scene_analyses"."status" <> 'CANCELLED' or "scene_analyses"."cancelled_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD CONSTRAINT "scene_analyses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_analyses" ADD CONSTRAINT "scene_analyses_upload_id_image_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."image_uploads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scene_analyses_upload_uidx" ON "scene_analyses" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "scene_analyses_owner_created_idx" ON "scene_analyses" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "scene_analyses_status_created_idx" ON "scene_analyses" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "scene_analyses_expires_idx" ON "scene_analyses" USING btree ("expires_at");