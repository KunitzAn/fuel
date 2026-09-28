CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "daily_active_energy" (
	"user_id" integer NOT NULL,
	"date" text NOT NULL,
	"total_active_kcal" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "daily_active_energy_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "total_kcal" real;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_active_energy" ADD CONSTRAINT "daily_active_energy_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_active_energy_user_sync_idx" ON "daily_active_energy" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_user_external_uidx" ON "activities" USING btree ("user_id","external_id");