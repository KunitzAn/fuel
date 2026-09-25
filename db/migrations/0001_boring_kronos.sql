CREATE TABLE "entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" text NOT NULL,
	"meal" text NOT NULL,
	"snack_id" text,
	"food_id" text,
	"catalog_id" text,
	"name" text NOT NULL,
	"brand" text,
	"protein" real NOT NULL,
	"fat" real NOT NULL,
	"carbs" real NOT NULL,
	"kcal" real NOT NULL,
	"grams" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"barcode" text,
	"protein" real NOT NULL,
	"fat" real NOT NULL,
	"carbs" real NOT NULL,
	"kcal" real NOT NULL,
	"note" text,
	"source_catalog_id" text,
	"last_grams" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "snacks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" text NOT NULL,
	"after" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_snack_id_snacks_id_fk" FOREIGN KEY ("snack_id") REFERENCES "public"."snacks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snacks" ADD CONSTRAINT "snacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_user_sync_idx" ON "entries" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "foods_user_sync_idx" ON "foods" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "snacks_user_sync_idx" ON "snacks" USING btree ("user_id","server_updated_at");