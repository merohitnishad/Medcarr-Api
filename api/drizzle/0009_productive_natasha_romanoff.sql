ALTER TYPE "application_status" ADD VALUE 'not-available';--> statement-breakpoint
ALTER TABLE "job_posts" ADD COLUMN "is_reviewed" boolean DEFAULT false NOT NULL;