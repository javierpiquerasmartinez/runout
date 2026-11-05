-- Every Hand has its Rake and Rake Generated now: import works them out, and backfill-rake filled in the ones stored before 0025. If any is still null this fails and changes nothing.
ALTER TABLE "hands" ALTER COLUMN "rake" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hands" ALTER COLUMN "hero_rake_generated" SET NOT NULL;