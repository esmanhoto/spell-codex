CREATE TABLE "game_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"player_id" uuid NOT NULL,
	"move" jsonb NOT NULL,
	"state_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_actions_game_sequence_unique" UNIQUE("game_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seat_position" integer NOT NULL,
	"deck_snapshot" jsonb NOT NULL,
	CONSTRAINT "game_players_game_user_unique" UNIQUE("game_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"format_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_action_at" timestamp with time zone DEFAULT now() NOT NULL,
	"turn_deadline" timestamp with time zone,
	"winner_id" uuid
);
--> statement-breakpoint
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_actions_game_id_idx" ON "game_actions" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_players_game_id_idx" ON "game_players" USING btree ("game_id");