ALTER TABLE "games" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "state_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_slug_unique" UNIQUE("slug");