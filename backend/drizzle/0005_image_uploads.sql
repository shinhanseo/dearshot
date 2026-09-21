CREATE TYPE "public"."upload_purpose" AS ENUM('SCENE_ANALYSIS', 'PHOTO_FEEDBACK');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('READY', 'CONSUMED', 'DELETED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "image_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" "upload_purpose" NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" varchar(32) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"status" "upload_status" DEFAULT 'READY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "image_uploads_byte_size_check" CHECK ("image_uploads"."byte_size" between 1 and 10485760),
	CONSTRAINT "image_uploads_dimensions_check" CHECK ("image_uploads"."width" between 1 and 8192 and "image_uploads"."height" between 1 and 8192),
	CONSTRAINT "image_uploads_sha256_check" CHECK ("image_uploads"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "image_uploads_content_type_check" CHECK ("image_uploads"."content_type" in ('image/jpeg', 'image/webp')),
	CONSTRAINT "image_uploads_consumed_at_check" CHECK ("image_uploads"."status" <> 'CONSUMED' or "image_uploads"."consumed_at" is not null),
	CONSTRAINT "image_uploads_deleted_at_check" CHECK ("image_uploads"."status" not in ('DELETED', 'EXPIRED') or "image_uploads"."deleted_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "image_uploads" ADD CONSTRAINT "image_uploads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "image_uploads_storage_path_uidx" ON "image_uploads" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "image_uploads_owner_status_idx" ON "image_uploads" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "image_uploads_expires_idx" ON "image_uploads" USING btree ("expires_at");
