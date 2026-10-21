-- Each Hand now stores its Hero's Result, worked out at import. Hands stored before can't be worked out in SQL, so they go, with everything that hangs off them.
TRUNCATE TABLE "hands", "queue_entries", "playbacks", "library_entries", "notes", "marks";--> statement-breakpoint
ALTER TABLE "hands" ADD COLUMN "hero_result" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hands" ADD COLUMN "hero_reached_showdown" boolean NOT NULL;
