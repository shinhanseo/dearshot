CREATE TYPE "public"."auth_provider" AS ENUM('GOOGLE', 'KAKAO');--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_subject" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_nonce_uses" (
	"nonce_hash" char(64) PRIMARY KEY NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_uidx" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_user_provider_uidx" ON "auth_identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "oauth_nonce_uses_expires_idx" ON "oauth_nonce_uses" USING btree ("token_expires_at");