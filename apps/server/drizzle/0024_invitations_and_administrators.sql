-- Accounts by Invitation only, with passwords, Suspension and Impersonation (ADR 0008).
CREATE TABLE "impersonations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administrator_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"language" text NOT NULL,
	"token_hash" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"account_id" uuid,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_attempts" (
	"email" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "invitation_id" uuid;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "suspended_by" uuid;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "last_signed_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
-- Who created a Room was never kept: its Master now is the best guess. Its last activity starts from the latest instant known of it.
UPDATE "rooms" SET "creator_id" = "master_id", "last_activity_at" = coalesce("closed_at", "created_at");--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "creator_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "last_activity_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonation_id" uuid;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_administrator_id_identities_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_account_id_identities_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sent_by_identities_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_account_id_identities_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_email_idx" ON "invitations" USING btree ("email") WHERE "invitations"."accepted_at" is null and "invitations"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "password_resets_identity_id_idx" ON "password_resets" USING btree ("identity_id");--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_suspended_by_identities_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_creator_id_identities_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonation_id_impersonations_id_fk" FOREIGN KEY ("impersonation_id") REFERENCES "public"."impersonations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- An Account is now found by its email, matched ignoring case: stored lower-case, one Account each.
UPDATE "identities" SET "email" = lower("email") WHERE "email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "identities_email_idx" ON "identities" USING btree ("email");