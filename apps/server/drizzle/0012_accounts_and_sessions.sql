-- Tokens move to their own table, so an Account can be signed in on several devices (ADR 0005).
-- Tokens held until now are not carried over: those identities are of no use any more, and a
-- browser whose token stops working simply gets a new one.
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_identity_id_idx" ON "sessions" USING btree ("identity_id");--> statement-breakpoint
ALTER TABLE "identities" DROP CONSTRAINT "identities_token_hash_unique";--> statement-breakpoint
ALTER TABLE "identities" DROP COLUMN "token_hash";--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "google_subject" text;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_google_subject_unique" UNIQUE("google_subject");
