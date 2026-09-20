CREATE TYPE "public"."account_type" AS ENUM('GUEST', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."aspect_ratio" AS ENUM('4:3', '9:16', '1:1');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'DELETION_PENDING', 'DELETED');--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"token_family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" varchar(35) NOT NULL,
	"default_aspect_ratio" "aspect_ratio" DEFAULT '4:3' NOT NULL,
	"allow_location_context" boolean DEFAULT false NOT NULL,
	"ai_processing_consent_version" varchar(32),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_type" "account_type" DEFAULT 'GUEST' NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"display_name" varchar(80),
	"profile_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_replaced_by_id_refresh_sessions_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."refresh_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_sessions_token_hash_uidx" ON "refresh_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_expires_idx" ON "refresh_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "refresh_sessions_installation_idx" ON "refresh_sessions" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX "refresh_sessions_family_idx" ON "refresh_sessions" USING btree ("token_family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_sessions_replaced_by_uidx" ON "refresh_sessions" USING btree ("replaced_by_id") WHERE "refresh_sessions"."replaced_by_id" is not null;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");