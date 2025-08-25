DO $$ BEGIN
 CREATE TYPE "public"."dbs_verification_status" AS ENUM('pending', 'verified', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "dbs_file_url" varchar(500);--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "dbs_verification_status" "dbs_verification_status" DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "dbs_verification_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "dbs_number" varchar(255);--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "dbs_expiry_date" date;--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "dbs_verification_notes" text;