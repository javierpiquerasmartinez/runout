DROP INDEX "hands_site_hand_hero_idx";--> statement-breakpoint
ALTER TABLE "hands" ADD COLUMN "hero_seat" integer;--> statement-breakpoint
-- Every stored Hand names its Hero among its seats; that seat joins its key.
UPDATE "hands" SET "hero_seat" = (
	SELECT ("seat"->>'seat')::integer
	FROM jsonb_array_elements("hands"."content"->'seats') AS "seat"
	WHERE "seat"->>'screenName' = "hands"."content"->'hero'->>'screenName'
	LIMIT 1
);--> statement-breakpoint
ALTER TABLE "hands" ALTER COLUMN "hero_seat" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hands_site_hand_hero_seat_idx" ON "hands" USING btree ("site","site_hand_id","hero_screen_name","hero_seat");
