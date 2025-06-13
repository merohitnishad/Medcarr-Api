ALTER TABLE "healthcare_profiles" RENAME COLUMN "about_me" TO "professional_title";--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ALTER COLUMN "professional_title" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ALTER COLUMN "professional_summary" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "individual_profiles" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD COLUMN "phone_number" varchar(20);