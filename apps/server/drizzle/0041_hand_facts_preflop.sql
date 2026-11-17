ALTER TABLE "hand_facts" ADD COLUMN "vpip_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "vpip_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "pfr_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "pfr_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "open_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "open_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "limp_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "limp_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "isolate_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "isolate_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "isolate_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "isolate_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "steal_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "steal_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "steal_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "steal_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "three_bet_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "three_bet_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "three_bet_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "three_bet_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "squeeze_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "squeeze_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "squeeze_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "squeeze_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "cold_call_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "cold_call_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "four_bet_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "four_bet_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "four_bet_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "four_bet_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "five_bet_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "five_bet_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "five_bet_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "five_bet_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "resteal_did" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "resteal_chance" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "resteal_faced" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "resteal_answer" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "preflop_role" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "preflop_faced_first" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "limpers" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "preflop_line" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "open_size" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "three_bet_size" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "four_bet_size" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "hero_raise_size" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "hero_raise_multiple" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "hero_second_raise_size" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "hero_second_raise_multiple" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "size_faced" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "hero_starting_stack" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "preflop_effective_stack" double precision;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "straddle" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "antes" boolean;