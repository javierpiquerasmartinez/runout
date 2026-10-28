-- Each Account keeps Ranges in its Lab: a name, unique ignoring case, and a Frequency for each Combo, as one JSON map (ADR 0006).
CREATE TABLE "ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"combos" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ranges" ADD CONSTRAINT "ranges_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ranges_identity_id_name_idx" ON "ranges" USING btree ("identity_id",lower("name"));