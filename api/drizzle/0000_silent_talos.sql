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
DO $$ BEGIN
 CREATE TYPE "public"."application_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled', 'not-available', 'closed', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cancellation_reason" AS ENUM('personal_emergency', 'health_issues', 'schedule_conflict', 'family_emergency', 'transportation_issues', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."caregiver_gender" AS ENUM('male', 'female', 'male-or-female', 'others');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."gender" AS ENUM('male', 'female');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."job_status" AS ENUM('open', 'closed', 'approved', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."job_type" AS ENUM('oneDay', 'weekly');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_type" AS ENUM('hourly', 'fixed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."relationship" AS ENUM('Myself', 'Mother', 'Father', 'Grandmother', 'Grandfather', 'Spouse', 'Friend', 'Organization', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."shift_type" AS ENUM('day', 'night');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."message_status" AS ENUM('sent', 'delivered', 'read');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'file');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_priority" AS ENUM('low', 'normal', 'high', 'urgent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_type" AS ENUM('job_application', 'application_accepted', 'application_rejected', 'application_cancelled', 'job_started', 'job_completed', 'job_cancelled_by_poster', 'job_cancelled_by_healthcare', 'payment_processed', 'report_submitted', 'system_announcement', 'new_message_received', 'review_received', 'dispute_created', 'dispute_status_updated', 'dispute_resolved', 'dispute_assigned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."review_status" AS ENUM('pending', 'submitted', 'responded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."role" AS ENUM('admin', 'individual', 'organization', 'healthcare');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "job_application_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_application_id" uuid NOT NULL,
	"preference_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"healthcare_user_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"application_message" text,
	"responded_at" timestamp with time zone,
	"response_message" text,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" "cancellation_reason",
	"cancellation_message" text,
	"cancelled_by" uuid,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"checkin_location" text,
	"checkout_location" text,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"completion_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_post_care_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"care_need_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_post_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_post_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"preference_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"age" integer NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"relationship" "relationship" NOT NULL,
	"gender" "gender" NOT NULL,
	"title" varchar(255) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"job_date" timestamp NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"shift_type" "shift_type" DEFAULT 'day' NOT NULL,
	"job_end_date" timestamp,
	"shift_length" integer NOT NULL,
	"overview" text NOT NULL,
	"caregiver_gender" "caregiver_gender" NOT NULL,
	"type" "job_type" NOT NULL,
	"parent_job_id" uuid,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_pattern" text,
	"payment_type" "payment_type" NOT NULL,
	"payment_cost" integer NOT NULL,
	"is_reviewed" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_application_id" uuid NOT NULL,
	"job_poster_id" uuid NOT NULL,
	"healthcare_user_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_id" uuid,
	"job_poster_last_read_at" timestamp with time zone,
	"healthcare_last_read_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_by" uuid,
	"blocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_job_application_id_unique" UNIQUE("job_application_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"file_name" varchar(255),
	"file_size" varchar(50),
	"mime_type" varchar(100),
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"read_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"reply_to_message_id" uuid,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"priority" "notification_priority" DEFAULT 'normal' NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"message_count" integer DEFAULT 1,
	"job_post_id" uuid,
	"job_application_id" uuid,
	"related_user_id" uuid,
	"dispute_id" uuid,
	"metadata" json,
	"action_url" varchar(500),
	"action_label" varchar(100),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"is_email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_helpful_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_helpful" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"healthcare_provider_id" uuid NOT NULL,
	"healthcare_profile_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"review_text" text NOT NULL,
	"professionalism_rating" integer NOT NULL,
	"punctuality_rating" integer NOT NULL,
	"quality_of_care_rating" integer NOT NULL,
	"communication_rating" integer NOT NULL,
	"would_recommend" boolean NOT NULL,
	"private_notes" text,
	"healthcare_response" text,
	"response_date" timestamp with time zone,
	"status" "review_status" DEFAULT 'submitted' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "healthcare_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"healthcare_profile_id" uuid NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"sort_code" varchar(8) NOT NULL,
	"account_number" varchar(8) NOT NULL,
	"bank_name" varchar(255),
	"is_verified" boolean DEFAULT false NOT NULL,
	"encryption_key_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "healthcare_bank_details_healthcare_profile_id_unique" UNIQUE("healthcare_profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "healthcare_profile_languages" (
	"healthcare_profile_id" uuid NOT NULL,
	"language_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "healthcare_profile_specialities" (
	"healthcare_profile_id" uuid NOT NULL,
	"speciality_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "healthcare_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"date_of_birth" date NOT NULL,
	"gender" "gender" NOT NULL,
	"professional_title" varchar(255) NOT NULL,
	"image_url" varchar(500),
	"nationality" varchar(100) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"professional_summary" text NOT NULL,
	"preferred_time" text[],
	"experience" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "healthcare_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "individual_profile_care_needs" (
	"individual_profile_id" uuid NOT NULL,
	"care_need_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "individual_profile_languages" (
	"individual_profile_id" uuid NOT NULL,
	"language_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "individual_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"about_you" text,
	"special_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "individual_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_name" varchar(255) NOT NULL,
	"organization_type" varchar(100) NOT NULL,
	"organization_registration_number" varchar(50) DEFAULT 'TEMP_REG_NUMBER' NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"overview" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organization_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cognito_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"profile_verified" boolean DEFAULT false NOT NULL,
	"profile_completed" boolean DEFAULT false NOT NULL,
	"dbs_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cognito_id_unique" UNIQUE("cognito_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "care_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_needs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "languages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specialities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
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
DO $$ BEGIN
 ALTER TABLE "job_application_preferences" ADD CONSTRAINT "job_application_preferences_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_application_preferences" ADD CONSTRAINT "job_application_preferences_preference_id_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."preferences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_healthcare_user_id_users_id_fk" FOREIGN KEY ("healthcare_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_post_care_needs" ADD CONSTRAINT "job_post_care_needs_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_post_care_needs" ADD CONSTRAINT "job_post_care_needs_care_need_id_care_needs_id_fk" FOREIGN KEY ("care_need_id") REFERENCES "public"."care_needs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_post_languages" ADD CONSTRAINT "job_post_languages_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_post_languages" ADD CONSTRAINT "job_post_languages_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_post_preferences" ADD CONSTRAINT "job_post_preferences_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_post_preferences" ADD CONSTRAINT "job_post_preferences_preference_id_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."preferences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_parent_job_id_job_posts_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_job_poster_id_users_id_fk" FOREIGN KEY ("job_poster_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_healthcare_user_id_users_id_fk" FOREIGN KEY ("healthcare_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_job_post_id_job_posts_id_fk" FOREIGN KEY ("job_post_id") REFERENCES "public"."job_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_healthcare_provider_id_users_id_fk" FOREIGN KEY ("healthcare_provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_healthcare_profile_id_healthcare_profiles_id_fk" FOREIGN KEY ("healthcare_profile_id") REFERENCES "public"."healthcare_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_bank_details" ADD CONSTRAINT "healthcare_bank_details_healthcare_profile_id_healthcare_profiles_id_fk" FOREIGN KEY ("healthcare_profile_id") REFERENCES "public"."healthcare_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_profile_languages" ADD CONSTRAINT "healthcare_profile_languages_healthcare_profile_id_healthcare_profiles_id_fk" FOREIGN KEY ("healthcare_profile_id") REFERENCES "public"."healthcare_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_profile_languages" ADD CONSTRAINT "healthcare_profile_languages_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_profile_specialities" ADD CONSTRAINT "healthcare_profile_specialities_healthcare_profile_id_healthcare_profiles_id_fk" FOREIGN KEY ("healthcare_profile_id") REFERENCES "public"."healthcare_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_profile_specialities" ADD CONSTRAINT "healthcare_profile_specialities_speciality_id_specialities_id_fk" FOREIGN KEY ("speciality_id") REFERENCES "public"."specialities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_profiles" ADD CONSTRAINT "healthcare_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "individual_profile_care_needs" ADD CONSTRAINT "individual_profile_care_needs_individual_profile_id_individual_profiles_id_fk" FOREIGN KEY ("individual_profile_id") REFERENCES "public"."individual_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "individual_profile_care_needs" ADD CONSTRAINT "individual_profile_care_needs_care_need_id_care_needs_id_fk" FOREIGN KEY ("care_need_id") REFERENCES "public"."care_needs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "individual_profile_languages" ADD CONSTRAINT "individual_profile_languages_individual_profile_id_individual_profiles_id_fk" FOREIGN KEY ("individual_profile_id") REFERENCES "public"."individual_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "individual_profile_languages" ADD CONSTRAINT "individual_profile_languages_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "individual_profiles" ADD CONSTRAINT "individual_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
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
CREATE INDEX IF NOT EXISTS "job_application_preferences_application_id_idx" ON "job_application_preferences" USING btree ("job_application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_application_preferences_preference_id_idx" ON "job_application_preferences" USING btree ("preference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_application_preference" ON "job_application_preferences" USING btree ("job_application_id","preference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_applications_job_post_id_idx" ON "job_applications" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_applications_healthcare_user_id_idx" ON "job_applications" USING btree ("healthcare_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_applications_status_idx" ON "job_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_applications_created_at_idx" ON "job_applications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_application" ON "job_applications" USING btree ("job_post_id","healthcare_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_post_care_needs_job_post_id_idx" ON "job_post_care_needs" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_post_care_needs_care_need_id_idx" ON "job_post_care_needs" USING btree ("care_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_post_care_need" ON "job_post_care_needs" USING btree ("job_post_id","care_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_post_languages_job_post_id_idx" ON "job_post_languages" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_post_languages_language_id_idx" ON "job_post_languages" USING btree ("language_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_post_language" ON "job_post_languages" USING btree ("job_post_id","language_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_post_preferences_job_post_id_idx" ON "job_post_preferences" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_post_preferences_preference_id_idx" ON "job_post_preferences" USING btree ("preference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_post_preference" ON "job_post_preferences" USING btree ("job_post_id","preference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_posts_user_id_idx" ON "job_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_posts_postcode_idx" ON "job_posts" USING btree ("postcode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_posts_type_idx" ON "job_posts" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_posts_job_date_idx" ON "job_posts" USING btree ("job_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_posts_parent_job_id_idx" ON "job_posts" USING btree ("parent_job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_job_application_id_idx" ON "conversations" USING btree ("job_application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_job_poster_id_idx" ON "conversations" USING btree ("job_poster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_healthcare_user_id_idx" ON "conversations" USING btree ("healthcare_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_is_active_idx" ON "conversations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_status_idx" ON "messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_reply_to_message_id_idx" ON "messages" USING btree ("reply_to_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_priority_idx" ON "notifications" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_scheduled_for_idx" ON "notifications" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_job_post_id_idx" ON "notifications" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_job_application_id_idx" ON "notifications" USING btree ("job_application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_dispute_id_idx" ON "notifications" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_helpful_votes_review_id_idx" ON "review_helpful_votes" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_helpful_votes_user_id_idx" ON "review_helpful_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_user_review_vote" ON "review_helpful_votes" USING btree ("review_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_job_post_id_idx" ON "reviews" USING btree ("job_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_reviewer_id_idx" ON "reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_healthcare_provider_id_idx" ON "reviews" USING btree ("healthcare_provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_healthcare_profile_id_idx" ON "reviews" USING btree ("healthcare_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_rating_idx" ON "reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_created_at_idx" ON "reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_review" ON "reviews" USING btree ("job_post_id","reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_bank_details_profile_id_idx" ON "healthcare_bank_details" USING btree ("healthcare_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_profile_languages_healthcare_profile_id_language_id_index" ON "healthcare_profile_languages" USING btree ("healthcare_profile_id","language_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_profile_specialities_healthcare_profile_id_speciality_id_index" ON "healthcare_profile_specialities" USING btree ("healthcare_profile_id","speciality_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_profiles_user_id_idx" ON "healthcare_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profile_care_needs_individual_profile_id_care_need_id_index" ON "individual_profile_care_needs" USING btree ("individual_profile_id","care_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profile_languages_individual_profile_id_language_id_index" ON "individual_profile_languages" USING btree ("individual_profile_id","language_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profiles_user_id_idx" ON "individual_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_profiles_user_id_idx" ON "organization_profiles" USING btree ("user_id");