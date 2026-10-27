-- Graph Colours: each Results Graph line's colour. Existing rows get the board's colours, the ones every Results Graph had until now.
ALTER TABLE "preferences" ADD COLUMN "result_colour" text DEFAULT 'teal' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "all_in_ev_colour" text DEFAULT 'amber' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "showdown_colour" text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "non_showdown_colour" text DEFAULT 'red' NOT NULL;