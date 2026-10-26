-- Every Hand has its final pot now: import works it out, and backfill-final-pot filled in the ones stored before 0018. If any is still null this fails and changes nothing.
ALTER TABLE "hands" ALTER COLUMN "final_pot" SET NOT NULL;
