-- The Hero's Stats in each Hand: one row per Stat they had an opportunity at, written at import. Hands stored before this have none until the Stats backfill.
CREATE TABLE "hand_stats" (
	"hand_id" uuid NOT NULL,
	"stat" text NOT NULL,
	"opportunities" integer NOT NULL,
	"taken" integer NOT NULL,
	CONSTRAINT "hand_stats_hand_id_stat_pk" PRIMARY KEY("hand_id","stat")
);
--> statement-breakpoint
ALTER TABLE "hand_stats" ADD CONSTRAINT "hand_stats_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;