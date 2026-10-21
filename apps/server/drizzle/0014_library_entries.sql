-- Each Account gets a Library of its own: references to Hands, shared with whoever else has them (ADR 0004).
CREATE TABLE "library_entries" (
	"identity_id" uuid NOT NULL,
	"hand_id" uuid NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "library_entries_identity_id_hand_id_pk" PRIMARY KEY("identity_id","hand_id")
);
--> statement-breakpoint
-- Previews are short-lived and unconfirmed ones are simply dropped: each now names its destination.
DELETE FROM "import_previews";--> statement-breakpoint
ALTER TABLE "import_previews" ALTER COLUMN "room_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_previews" ADD COLUMN "destination" text NOT NULL;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entries" ADD CONSTRAINT "library_entries_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_entries_hand_id_idx" ON "library_entries" USING btree ("hand_id");