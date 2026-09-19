CREATE TABLE "screen_names" (
	"identity_id" uuid NOT NULL,
	"screen_name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "screen_names_identity_id_screen_name_pk" PRIMARY KEY("identity_id","screen_name")
);
--> statement-breakpoint
ALTER TABLE "screen_names" ADD CONSTRAINT "screen_names_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hands imported more than once before duplicates were refused are folded
-- into the first import of each: the Queue and Playback point at it instead.
CREATE TEMPORARY TABLE "duplicate_hands" AS
SELECT "id", "kept" FROM (
	SELECT "id", first_value("id") OVER (
		PARTITION BY "site", "site_hand_id", "hero_screen_name"
		ORDER BY "imported_at", "id"
	) AS "kept"
	FROM "hands"
) AS "ranked"
WHERE "id" <> "kept";--> statement-breakpoint
UPDATE "queue_entries" SET "hand_id" = "duplicate_hands"."kept" FROM "duplicate_hands" WHERE "queue_entries"."hand_id" = "duplicate_hands"."id";--> statement-breakpoint
UPDATE "playbacks" SET "hand_id" = "duplicate_hands"."kept" FROM "duplicate_hands" WHERE "playbacks"."hand_id" = "duplicate_hands"."id";--> statement-breakpoint
DELETE FROM "hands" USING "duplicate_hands" WHERE "hands"."id" = "duplicate_hands"."id";--> statement-breakpoint
DROP TABLE "duplicate_hands";--> statement-breakpoint
CREATE UNIQUE INDEX "hands_site_hand_hero_idx" ON "hands" USING btree ("site","site_hand_id","hero_screen_name");