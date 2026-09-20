CREATE TABLE "marks" (
	"identity_id" uuid NOT NULL,
	"hand_id" uuid NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "marks_identity_id_hand_id_pk" PRIMARY KEY("identity_id","hand_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"hand_id" uuid NOT NULL,
	"writer_id" uuid NOT NULL,
	"body" text NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_writer_id_identities_id_fk" FOREIGN KEY ("writer_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_hand_id_idx" ON "notes" USING btree ("hand_id");