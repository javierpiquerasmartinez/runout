CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "identities_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "room_memberships" (
	"room_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"kicked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "room_memberships_room_id_identity_id_pk" PRIMARY KEY("room_id","identity_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"master_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_master_id_identities_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;