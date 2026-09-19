CREATE TABLE "hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site" text NOT NULL,
	"site_hand_id" text NOT NULL,
	"hero_screen_name" text NOT NULL,
	"author_id" uuid NOT NULL,
	"importer_id" uuid NOT NULL,
	"source_format" text NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"currency" text NOT NULL,
	"content" jsonb NOT NULL,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"hand_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_author_id_identities_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" ADD CONSTRAINT "hands_importer_id_identities_id_fk" FOREIGN KEY ("importer_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_entries_room_id_idx" ON "queue_entries" USING btree ("room_id");