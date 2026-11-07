ALTER TABLE "rooms" ADD COLUMN "last_entered_at" timestamp with time zone;--> statement-breakpoint
UPDATE "rooms" SET "last_entered_at" = "last_activity_at";--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "last_entered_at" SET NOT NULL;
