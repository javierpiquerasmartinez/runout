CREATE TABLE "playbacks" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"hand_id" uuid NOT NULL,
	"action_index" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playbacks" ADD CONSTRAINT "playbacks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbacks" ADD CONSTRAINT "playbacks_hand_id_hands_id_fk" FOREIGN KEY ("hand_id") REFERENCES "public"."hands"("id") ON DELETE no action ON UPDATE no action;