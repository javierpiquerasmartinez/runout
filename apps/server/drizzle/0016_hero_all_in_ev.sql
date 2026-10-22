-- Each Hand now stores its Hero's All-in EV, worked out at import. SQL can't work it out for Hands stored before, so they start from their Result, which is what it is for every Hand not decided by an all-in before the river.
ALTER TABLE "hands" ADD COLUMN "hero_all_in_ev" integer;--> statement-breakpoint
UPDATE "hands" SET "hero_all_in_ev" = "hero_result";--> statement-breakpoint
ALTER TABLE "hands" ALTER COLUMN "hero_all_in_ev" SET NOT NULL;
