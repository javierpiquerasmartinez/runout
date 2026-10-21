-- Runout starts clean: nothing from before Libraries and Accounts is kept.
TRUNCATE TABLE "identities", "screen_names", "preferences", "rooms", "room_memberships", "hands", "queue_entries", "playbacks", "import_previews", "notes", "marks";--> statement-breakpoint
ALTER TABLE "hands" DROP CONSTRAINT "hands_author_id_identities_id_fk";
--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "author_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_author_id_identities_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hands" DROP COLUMN "author_id";