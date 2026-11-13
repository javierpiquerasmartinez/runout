CREATE TABLE "bulk_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"status" text NOT NULL,
	"files" jsonb NOT NULL,
	"total" integer,
	"processed" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"not_imported" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"failure_code" text,
	"last_advanced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bulk_imports" ADD CONSTRAINT "bulk_imports_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_imports_identity_id_idx" ON "bulk_imports" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "bulk_imports_status_idx" ON "bulk_imports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bulk_imports_one_unfinished_idx" ON "bulk_imports" USING btree ("identity_id") WHERE "bulk_imports"."status" not in ('completed', 'failed', 'cancelled');