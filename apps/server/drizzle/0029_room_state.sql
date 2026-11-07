-- Every Room open now starts in Free Review (ADR 0009): no Playback is shared outside Live.
ALTER TABLE "rooms" ADD COLUMN "state" text DEFAULT 'free-review' NOT NULL;--> statement-breakpoint
DELETE FROM "playbacks";
