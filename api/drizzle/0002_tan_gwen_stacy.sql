ALTER TABLE "healthcare_profiles" ADD COLUMN "date_of_birth" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "gender" "gender" NOT NULL;--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "nationality" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "job_posts" DROP COLUMN IF EXISTS "name";