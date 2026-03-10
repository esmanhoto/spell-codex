CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nickname" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_players" ADD COLUMN "nickname" text DEFAULT '' NOT NULL;