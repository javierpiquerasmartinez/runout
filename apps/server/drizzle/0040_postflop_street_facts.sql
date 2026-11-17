ALTER TABLE "hand_facts" ADD COLUMN "flop_saw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_players" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_ip" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_first" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_pot" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_effective_stack" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_spr" numeric(9, 1);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_all_in" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_line" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_bet_size" integer;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_raise_size" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_bet_size_faced" integer;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_raise_size_faced" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_bets" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_raises" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_calls" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "flop_folds" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_saw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_players" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_ip" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_first" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_pot" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_effective_stack" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_spr" numeric(9, 1);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_all_in" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_line" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_bet_size" integer;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_raise_size" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_bet_size_faced" integer;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_raise_size_faced" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_bets" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_raises" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_calls" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "turn_folds" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_saw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_players" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_ip" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_first" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_pot" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_effective_stack" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_spr" numeric(9, 1);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_all_in" boolean;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_line" text;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_bet_size" integer;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_raise_size" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_bet_size_faced" integer;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_raise_size_faced" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_bets" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_raises" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_calls" smallint;--> statement-breakpoint
ALTER TABLE "hand_facts" ADD COLUMN "river_folds" smallint;