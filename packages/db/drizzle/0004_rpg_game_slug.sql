ALTER TABLE "games" ADD COLUMN "slug" text;
ALTER TABLE "games" ADD CONSTRAINT "games_slug_unique" UNIQUE("slug");
