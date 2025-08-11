DO $$ BEGIN
 CREATE TYPE "public"."dispute_status" AS ENUM('open', 'in_review', 'resolved', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."dispute_type" AS ENUM('no_show', 'shift delay', 'unprofessional_behavior', 'safety_concern', 'payment_issue', 'breach_of_agreement', 'poor_communication', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'dispute_created';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'dispute_status_updated';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'dispute_resolved';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'dispute_assigned';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispute_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"s3_url" varchar(1000) NOT NULL,
	"file_size" varchar(50) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_number" varchar(20) NOT NULL,
	"job_post_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"reported_against" uuid NOT NULL,
	"dispute_type" "dispute_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"assigned_to_admin" uuid,
	"admin_notes" text,
	"resolution_description" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_started_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_dispute_number_unique" UNIQUE("dispute_number")
);
--> statement-breakpoint
ALTER TABLE "job_applications" DROP CONSTRAINT "job_applications_reported_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dispute_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute_documents" ADD CONSTRAINT "dispute_documents_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispute_documents" ADD CONSTRAINT "dispute_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_reported_against_users_id_fk" FOREIGN KEY ("reported_against") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assigned_to_admin_users_id_fk" FOREIGN KEY ("assigned_to_admin") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispute_documents_dispute_id_idx" ON "dispute_documents" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispute_documents_uploaded_by_idx" ON "dispute_documents" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispute_documents_s3_key_idx" ON "dispute_documents" USING btree ("s3_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_job_post_id_idx" ON "disputes" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_reported_by_idx" ON "disputes" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_reported_against_idx" ON "disputes" USING btree ("reported_against");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_dispute_number_idx" ON "disputes" USING btree ("dispute_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "disputes_created_at_idx" ON "disputes" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "job_applications" DROP COLUMN IF EXISTS "reported_at";--> statement-breakpoint
ALTER TABLE "job_applications" DROP COLUMN IF EXISTS "report_reason";--> statement-breakpoint
ALTER TABLE "job_applications" DROP COLUMN IF EXISTS "report_message";--> statement-breakpoint
ALTER TABLE "job_applications" DROP COLUMN IF EXISTS "reported_by";