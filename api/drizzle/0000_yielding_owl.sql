DO $$ BEGIN
 CREATE TYPE "public"."caregiver_gender" AS ENUM('male', 'female');
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
 CREATE TYPE "public"."role" AS ENUM('admin', 'individual', 'organization', 'healthcare');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_post_care_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"care_need_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_post_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_post_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_post_id" uuid NOT NULL,
	"preference_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"age" integer NOT NULL,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"relationship" varchar(100),
	"gender" "gender" NOT NULL,
	"title" varchar(255) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"shift_length" integer NOT NULL,
	"overview" text NOT NULL,
	"caregiver_gender" "caregiver_gender" NOT NULL,
	"type" "job_type" NOT NULL,
	"start_week" timestamp,
	"end_week" timestamp,
	"recurring_weekday" text[],
	"payment_type" "payment_type" NOT NULL,
	"payment_cost" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"description" text,
	"image" varchar(255),
	"price" double precision NOT NULL
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
	"professional_title" varchar(255) NOT NULL,
	"image_url" varchar(500),
	"postcode" varchar(20) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"professional_summary" text NOT NULL,
	"preferred_time" text[],
	"experience" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "individual_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_name" varchar(255) NOT NULL,
	"organization_type" varchar(100) NOT NULL,
	"postcode" varchar(20) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"overview" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_cognito_id_unique" UNIQUE("cognito_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "care_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "care_needs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "languages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "specialities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "specialities_name_unique" UNIQUE("name")
);
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
CREATE INDEX IF NOT EXISTS "job_posts_start_time_idx" ON "job_posts" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_profile_languages_healthcare_profile_id_language_id_index" ON "healthcare_profile_languages" USING btree ("healthcare_profile_id","language_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_profile_specialities_healthcare_profile_id_speciality_id_index" ON "healthcare_profile_specialities" USING btree ("healthcare_profile_id","speciality_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_profiles_user_id_idx" ON "healthcare_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profile_care_needs_individual_profile_id_care_need_id_index" ON "individual_profile_care_needs" USING btree ("individual_profile_id","care_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profile_languages_individual_profile_id_language_id_index" ON "individual_profile_languages" USING btree ("individual_profile_id","language_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profiles_user_id_idx" ON "individual_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_profiles_user_id_idx" ON "organization_profiles" USING btree ("user_id");