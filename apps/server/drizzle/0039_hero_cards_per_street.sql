ALTER TABLE "hand_facts" ADD COLUMN "flop_made_hand" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_draws" text[];--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_nuts" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_kicker" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_nut_flush_draw" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_made_hand" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_draws" text[];--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_nuts" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_kicker" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_nut_flush_draw" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_made_hand" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_nuts" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_kicker" text;