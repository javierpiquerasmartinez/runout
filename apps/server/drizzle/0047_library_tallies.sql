CREATE TABLE "library_tallies" (
	"identity_id" uuid NOT NULL,
	"site" text NOT NULL,
	"hero_screen_name" text NOT NULL,
	"stake_limit" text NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"currency" text NOT NULL,
	"hands" integer NOT NULL,
	CONSTRAINT "library_tallies_pk" PRIMARY KEY("identity_id","site","hero_screen_name","stake_limit","small_blind","big_blind","currency")
);
--> statement-breakpoint
ALTER TABLE "library_tallies" ADD CONSTRAINT "library_tallies_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The tallies change with the statement that changes a Library: a Hand added
-- to it, taken out of it, or rewritten with another Poker Site, Hero or Stake.
-- Each function adds a signed count per group and deletes the groups left at 0.
CREATE FUNCTION "library_tallies_add"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "library_tallies" AS t
  SELECT e.identity_id, h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit',
         h.small_blind, h.big_blind, h.currency, count(*)
  FROM "added_entries" e JOIN "hands" h ON h.id = e.hand_id
  GROUP BY 1, 2, 3, 4, 5, 6, 7
  ORDER BY 1, 2, 3, 4, 5, 6, 7
  ON CONFLICT ON CONSTRAINT "library_tallies_pk"
  DO UPDATE SET hands = t.hands + excluded.hands;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION "library_tallies_remove"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "library_tallies" AS t
  SELECT e.identity_id, h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit',
         h.small_blind, h.big_blind, h.currency, -count(*)
  FROM "removed_entries" e JOIN "hands" h ON h.id = e.hand_id
  GROUP BY 1, 2, 3, 4, 5, 6, 7
  ORDER BY 1, 2, 3, 4, 5, 6, 7
  ON CONFLICT ON CONSTRAINT "library_tallies_pk"
  DO UPDATE SET hands = t.hands + excluded.hands;
  DELETE FROM "library_tallies"
  WHERE hands = 0 AND identity_id IN (SELECT identity_id FROM "removed_entries");
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION "library_tallies_move"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "library_tallies" AS t
  SELECT identity_id, site, hero_screen_name, stake_limit, small_blind, big_blind, currency, sum(n)
  FROM (
    SELECT e.identity_id, h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit' AS stake_limit,
           h.small_blind, h.big_blind, h.currency, -1 AS n
    FROM "removed_entries" e JOIN "hands" h ON h.id = e.hand_id
    UNION ALL
    SELECT e.identity_id, h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit',
           h.small_blind, h.big_blind, h.currency, 1
    FROM "added_entries" e JOIN "hands" h ON h.id = e.hand_id
  ) moved
  GROUP BY 1, 2, 3, 4, 5, 6, 7
  ORDER BY 1, 2, 3, 4, 5, 6, 7
  ON CONFLICT ON CONSTRAINT "library_tallies_pk"
  DO UPDATE SET hands = t.hands + excluded.hands;
  DELETE FROM "library_tallies"
  WHERE hands = 0 AND identity_id IN (SELECT identity_id FROM "removed_entries");
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION "library_tallies_rewrite"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Most rewrites keep the Poker Site, Hero and Stake; those change nothing.
  IF NOT EXISTS (
    SELECT 1 FROM "old_hands" o JOIN "new_hands" h ON h.id = o.id
    WHERE (o.site, o.hero_screen_name, o.content -> 'stake' ->> 'limit', o.small_blind, o.big_blind, o.currency)
      IS DISTINCT FROM
          (h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit', h.small_blind, h.big_blind, h.currency)
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO "library_tallies" AS t
  SELECT e.identity_id, g.site, g.hero_screen_name, g.stake_limit,
         g.small_blind, g.big_blind, g.currency, sum(g.n)
  FROM "old_hands" o
  JOIN "new_hands" h ON h.id = o.id
  JOIN "library_entries" e ON e.hand_id = o.id
  CROSS JOIN LATERAL (VALUES
    (o.site, o.hero_screen_name, o.content -> 'stake' ->> 'limit', o.small_blind, o.big_blind, o.currency, -1),
    (h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit', h.small_blind, h.big_blind, h.currency, 1)
  ) AS g (site, hero_screen_name, stake_limit, small_blind, big_blind, currency, n)
  GROUP BY 1, 2, 3, 4, 5, 6, 7
  ORDER BY 1, 2, 3, 4, 5, 6, 7
  ON CONFLICT ON CONSTRAINT "library_tallies_pk"
  DO UPDATE SET hands = t.hands + excluded.hands;
  DELETE FROM "library_tallies"
  WHERE hands = 0 AND identity_id IN (
    SELECT e.identity_id FROM "old_hands" o JOIN "library_entries" e ON e.hand_id = o.id
  );
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER "library_entries_tallies_add" AFTER INSERT ON "library_entries"
  REFERENCING NEW TABLE AS "added_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "library_tallies_add"();
--> statement-breakpoint
CREATE TRIGGER "library_entries_tallies_remove" AFTER DELETE ON "library_entries"
  REFERENCING OLD TABLE AS "removed_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "library_tallies_remove"();
--> statement-breakpoint
CREATE TRIGGER "library_entries_tallies_move" AFTER UPDATE ON "library_entries"
  REFERENCING OLD TABLE AS "removed_entries" NEW TABLE AS "added_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "library_tallies_move"();
--> statement-breakpoint
CREATE TRIGGER "hands_tallies_rewrite" AFTER UPDATE ON "hands"
  REFERENCING OLD TABLE AS "old_hands" NEW TABLE AS "new_hands"
  FOR EACH STATEMENT EXECUTE FUNCTION "library_tallies_rewrite"();
--> statement-breakpoint
INSERT INTO "library_tallies"
SELECT e.identity_id, h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit',
       h.small_blind, h.big_blind, h.currency, count(*)
FROM "library_entries" e JOIN "hands" h ON h.id = e.hand_id
GROUP BY 1, 2, 3, 4, 5, 6, 7;
