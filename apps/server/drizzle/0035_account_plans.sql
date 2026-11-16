-- Every Account is on a Plan, and an Invitation offers one (ADR 0011).
CREATE TABLE "plan_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_before" text,
	"plan_after" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"how" text NOT NULL,
	"administrator_id" uuid
);
--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "plan" text;--> statement-breakpoint
-- Invitations sent before Plans offer Pro, so nobody invited then gets less than was meant; new ones offer Beta.
ALTER TABLE "invitations" ADD COLUMN "plan" text DEFAULT 'pro' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "plan" SET DEFAULT 'beta';--> statement-breakpoint
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_account_id_identities_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_administrator_id_identities_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_changes_account_id_changed_at_idx" ON "plan_changes" USING btree ("account_id","changed_at");--> statement-breakpoint
-- Accounts from before Plans start on Pro, so nobody loses what they had, and their history starts with that.
UPDATE "identities" SET "plan" = 'pro' WHERE "google_subject" IS NOT NULL OR "password_hash" IS NOT NULL;--> statement-breakpoint
INSERT INTO "plan_changes" ("account_id", "plan_before", "plan_after", "changed_at", "how")
SELECT "id", NULL, 'pro', now(), 'migration' FROM "identities" WHERE "plan" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_account_plan_check" CHECK (("identities"."google_subject" is null and "identities"."password_hash" is null) = ("identities"."plan" is null));