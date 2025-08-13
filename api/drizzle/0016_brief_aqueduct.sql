DO $$ BEGIN
 CREATE TYPE "public"."shift_type" AS ENUM('day', 'night');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "job_posts" ADD COLUMN "shift_type" "shift_type" DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_posts" ADD COLUMN "job_end_date" timestamp;