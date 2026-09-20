CREATE TABLE "template_bookmarks" (
	"user_id" uuid NOT NULL,
	"template_id" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_bookmarks_user_id_template_id_pk" PRIMARY KEY("user_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "template_likes" (
	"user_id" uuid NOT NULL,
	"template_id" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_likes_user_id_template_id_pk" PRIMARY KEY("user_id","template_id")
);
--> statement-breakpoint
ALTER TABLE "template_bookmarks" ADD CONSTRAINT "template_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_bookmarks" ADD CONSTRAINT "template_bookmarks_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_likes" ADD CONSTRAINT "template_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_likes" ADD CONSTRAINT "template_likes_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_bookmarks_user_created_idx" ON "template_bookmarks" USING btree ("user_id","created_at" DESC NULLS LAST,"template_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "template_likes_user_created_idx" ON "template_likes" USING btree ("user_id","created_at" DESC NULLS LAST,"template_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "template_likes_template_created_idx" ON "template_likes" USING btree ("template_id","created_at");