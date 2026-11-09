-- Each Account keeps Goals: a name, an optional description, a Target and a Current Value as exact decimals of two places, and a Start Date and a Deadline as calendar dates with no time.
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target" numeric(11, 2) NOT NULL,
	"current_value" numeric(11, 2) DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"deadline" date NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_identity_id_idx" ON "goals" USING btree ("identity_id");