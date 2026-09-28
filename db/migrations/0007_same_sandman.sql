ALTER TABLE "daily_active_energy" ALTER COLUMN "total_active_kcal" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_active_energy" ADD COLUMN "resting_kcal" real;