-- An anonymous identity now exists for one Room only, and ends when it closes (ADR 0005).
-- Those issued until now, on first visit and bound to no Room, end here: their browsers
-- simply go on without one until they join a Room or sign in.
ALTER TABLE "identities" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DELETE FROM "sessions" WHERE "identity_id" IN (SELECT "id" FROM "identities" WHERE "google_subject" IS NULL);
