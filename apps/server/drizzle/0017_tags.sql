-- Each Account gets Tags of its own to classify the Hands of its Library; a Tag link hangs off the Library entry.
CREATE TABLE "tag_links" (
	"tag_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"hand_id" uuid NOT NULL,
	CONSTRAINT "tag_links_tag_id_hand_id_pk" PRIMARY KEY("tag_id","hand_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag_links" ADD CONSTRAINT "tag_links_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_links" ADD CONSTRAINT "tag_links_library_entry_fk" FOREIGN KEY ("identity_id","hand_id") REFERENCES "public"."library_entries"("identity_id","hand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tag_links_identity_id_hand_id_idx" ON "tag_links" USING btree ("identity_id","hand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_identity_id_name_idx" ON "tags" USING btree ("identity_id",lower("name"));