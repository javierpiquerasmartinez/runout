CREATE TABLE "hand_facts" (
	"hand_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"players_dealt" smallint NOT NULL,
	"hero_position" text,
	"hero_combo" text,
	"hero_hand_class" text,
	"pot_type" text NOT NULL,
	"opener_position" text,
	"three_bettor_position" text,
	"four_bettor_position" text,
	"aggressor_position" text,
	"hero_aggressor" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hand_facts" ADD CONSTRAINT "hand_facts_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;