CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"ticket_id" uuid NOT NULL,
	"administrator_id" uuid,
	"text" text NOT NULL,
	"written_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"opened_by_administrator_id" uuid,
	"bulk_import_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_administrator_id_identities_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_opened_by_administrator_id_identities_id_fk" FOREIGN KEY ("opened_by_administrator_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_bulk_import_id_bulk_imports_id_fk" FOREIGN KEY ("bulk_import_id") REFERENCES "public"."bulk_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_messages_ticket_id_idx" ON "support_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_tickets_identity_id_idx" ON "support_tickets" USING btree ("identity_id");