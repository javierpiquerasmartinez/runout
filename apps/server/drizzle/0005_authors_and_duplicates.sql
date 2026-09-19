CREATE TABLE "screen_names" (
	"identity_id" uuid NOT NULL,
	"screen_name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "screen_names_identity_id_screen_name_pk" PRIMARY KEY("identity_id","screen_name")
);
--> statement-breakpoint
ALTER TABLE "screen_names" ADD CONSTRAINT "screen_names_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hands_site_hand_hero_idx" ON "hands" USING btree ("site","site_hand_id","hero_screen_name");