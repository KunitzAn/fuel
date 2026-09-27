CREATE TABLE "day_types" (
	"user_id" integer NOT NULL,
	"date" text NOT NULL,
	"planned" text,
	"planned_source" text,
	"planned_delta_protein" real,
	"planned_delta_fat" real,
	"planned_delta_carbs" real,
	"actual" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "day_types_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "goal_settings" ADD COLUMN "high_delta_protein" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ADD COLUMN "high_delta_fat" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ADD COLUMN "high_delta_carbs" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ADD COLUMN "low_delta_protein" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ADD COLUMN "low_delta_fat" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ADD COLUMN "low_delta_carbs" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_types" ADD CONSTRAINT "day_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "day_types_user_sync_idx" ON "day_types" USING btree ("user_id","server_updated_at");