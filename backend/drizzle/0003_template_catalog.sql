CREATE TYPE "public"."guide_type" AS ENUM('SVG_OVERLAY', 'RASTER_OVERLAY');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."template_version_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "catalog_state" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"catalog_version" varchar(64) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_state_singleton_check" CHECK ("catalog_state"."id" = 'current')
);
--> statement-breakpoint
CREATE TABLE "scene_localizations" (
	"scene_key" varchar(64) NOT NULL,
	"locale" varchar(35) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	CONSTRAINT "scene_localizations_scene_key_locale_pk" PRIMARY KEY("scene_key","locale")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"thumbnail_path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_scenes" (
	"template_id" varchar(80) NOT NULL,
	"scene_key" varchar(64) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "template_scenes_template_id_scene_key_pk" PRIMARY KEY("template_id","scene_key")
);
--> statement-breakpoint
CREATE TABLE "template_version_localizations" (
	"template_id" varchar(80) NOT NULL,
	"version" integer NOT NULL,
	"locale" varchar(35) NOT NULL,
	"title" varchar(120) NOT NULL,
	"summary" text NOT NULL,
	"instructions" jsonb NOT NULL,
	CONSTRAINT "template_version_localizations_template_id_version_locale_pk" PRIMARY KEY("template_id","version","locale")
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"template_id" varchar(80) NOT NULL,
	"version" integer NOT NULL,
	"status" "template_version_status" DEFAULT 'DRAFT' NOT NULL,
	"preview_path" text NOT NULL,
	"thumbnail_path" text NOT NULL,
	"guide_type" "guide_type" NOT NULL,
	"guide_asset_path" text NOT NULL,
	"guide_config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "template_versions_template_id_version_pk" PRIMARY KEY("template_id","version"),
	CONSTRAINT "template_versions_version_check" CHECK ("template_versions"."version" > 0),
	CONSTRAINT "template_versions_published_at_check" CHECK ("template_versions"."status" <> 'PUBLISHED' or "template_versions"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" varchar(80) PRIMARY KEY NOT NULL,
	"status" "template_status" DEFAULT 'DRAFT' NOT NULL,
	"people_count" integer NOT NULL,
	"supported_aspect_ratios" "aspect_ratio"[] NOT NULL,
	"current_version" integer,
	"like_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_people_count_check" CHECK ("templates"."people_count" between 1 and 10),
	CONSTRAINT "templates_like_count_check" CHECK ("templates"."like_count" >= 0),
	CONSTRAINT "templates_published_version_check" CHECK ("templates"."status" <> 'PUBLISHED' or "templates"."current_version" is not null)
);
--> statement-breakpoint
ALTER TABLE "scene_localizations" ADD CONSTRAINT "scene_localizations_scene_key_scenes_key_fk" FOREIGN KEY ("scene_key") REFERENCES "public"."scenes"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_scenes" ADD CONSTRAINT "template_scenes_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_scenes" ADD CONSTRAINT "template_scenes_scene_key_scenes_key_fk" FOREIGN KEY ("scene_key") REFERENCES "public"."scenes"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version_localizations" ADD CONSTRAINT "template_version_localizations_version_fk" FOREIGN KEY ("template_id","version") REFERENCES "public"."template_versions"("template_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_current_version_fk" FOREIGN KEY ("id","current_version") REFERENCES "public"."template_versions"("template_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_active_sort_idx" ON "scenes" USING btree ("active","sort_order","key");--> statement-breakpoint
CREATE INDEX "template_scenes_scene_sort_idx" ON "template_scenes" USING btree ("scene_key","sort_order","template_id");--> statement-breakpoint
CREATE INDEX "template_versions_published_idx" ON "template_versions" USING btree ("status","published_at","template_id");--> statement-breakpoint
CREATE INDEX "templates_status_sort_idx" ON "templates" USING btree ("status","sort_order","id");--> statement-breakpoint
CREATE INDEX "templates_status_popular_idx" ON "templates" USING btree ("status","like_count","id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_published_template_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published template versions are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER template_versions_published_immutable
BEFORE UPDATE OR DELETE ON "template_versions"
FOR EACH ROW EXECUTE FUNCTION reject_published_template_version_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_published_template_localization_mutation()
RETURNS trigger AS $$
DECLARE
  target_template_id varchar(80);
  target_version integer;
BEGIN
  target_template_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.template_id ELSE NEW.template_id END;
  target_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.version ELSE NEW.version END;
  IF EXISTS (
    SELECT 1 FROM template_versions
    WHERE template_id = target_template_id
      AND version = target_version
      AND status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'published template version localizations are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER template_version_localizations_published_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "template_version_localizations"
FOR EACH ROW EXECUTE FUNCTION reject_published_template_localization_mutation();
