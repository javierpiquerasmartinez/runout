-- Each Account gets Lab Tags of its own to group the Ranges of its Lab, a set apart from the Library's Tags; a link goes with its Range or its Tag.
CREATE TABLE "lab_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "range_tag_links" (
	"range_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "range_tag_links_range_id_tag_id_pk" PRIMARY KEY("range_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "lab_tags" ADD CONSTRAINT "lab_tags_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "range_tag_links" ADD CONSTRAINT "range_tag_links_range_id_ranges_id_fk" FOREIGN KEY ("range_id") REFERENCES "public"."ranges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "range_tag_links" ADD CONSTRAINT "range_tag_links_tag_id_lab_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."lab_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_tags_identity_id_name_idx" ON "lab_tags" USING btree ("identity_id",lower("name"));--> statement-breakpoint
CREATE INDEX "range_tag_links_tag_id_idx" ON "range_tag_links" USING btree ("tag_id");