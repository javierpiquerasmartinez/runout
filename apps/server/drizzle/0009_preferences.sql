CREATE TABLE "preferences" (
	"identity_id" uuid PRIMARY KEY NOT NULL,
	"deck_style" text NOT NULL,
	"four_colour" boolean NOT NULL,
	"pot_percentage" boolean NOT NULL,
	"display_unit" text NOT NULL,
	"theme" text NOT NULL,
	"language" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;