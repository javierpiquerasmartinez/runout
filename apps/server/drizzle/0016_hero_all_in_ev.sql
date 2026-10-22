-- Each Hand now stores its Hero's All-in EV, worked out at import. Hands stored before can't be worked out in SQL, so they go, with everything that hangs off them.
TRUNCATE TABLE "hands", "queue_entries", "playbacks", "library_entries", "notes", "marks";--> statement-breakpoint
ALTER TABLE "hands" ADD COLUMN "hero_all_in_ev" integer NOT NULL;
