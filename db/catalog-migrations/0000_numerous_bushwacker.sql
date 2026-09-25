-- gin_trgm_ops и similarity() — из pg_trgm; drizzle-kit расширения сам не создаёт
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" text PRIMARY KEY NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"protein" real NOT NULL,
	"fat" real NOT NULL,
	"carbs" real NOT NULL,
	"kcal" real NOT NULL,
	"source" text NOT NULL,
	"countries" text[] DEFAULT '{}' NOT NULL,
	"search" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_products_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE INDEX "catalog_search_trgm_idx" ON "catalog_products" USING gin ("search" gin_trgm_ops);