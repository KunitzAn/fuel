CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" text NOT NULL,
	"source" text NOT NULL,
	"name" text,
	"kcal" real NOT NULL,
	"external_id" text,
	"started_at" timestamp with time zone,
	"duration_min" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goal_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"valid_from" text NOT NULL,
	"base_protein" real NOT NULL,
	"base_fat" real NOT NULL,
	"base_carbs" real NOT NULL,
	"resting_kcal" real NOT NULL,
	"per_hundred_protein" real NOT NULL,
	"per_hundred_fat" real NOT NULL,
	"per_hundred_carbs" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_settings" ADD CONSTRAINT "goal_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_sync_idx" ON "activities" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "goal_settings_user_sync_idx" ON "goal_settings" USING btree ("user_id","server_updated_at");