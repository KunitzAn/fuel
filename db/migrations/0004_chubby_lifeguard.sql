ALTER TABLE "goal_settings" ALTER COLUMN "base_protein" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "base_fat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "base_carbs" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "resting_kcal" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "per_hundred_protein" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "per_hundred_fat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "per_hundred_carbs" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "high_delta_protein" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "high_delta_protein" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "high_delta_fat" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "high_delta_fat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "high_delta_carbs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "high_delta_carbs" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "low_delta_protein" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "low_delta_protein" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "low_delta_fat" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "low_delta_fat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "low_delta_carbs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goal_settings" ALTER COLUMN "low_delta_carbs" DROP NOT NULL;