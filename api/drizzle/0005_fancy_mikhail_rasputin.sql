CREATE TABLE IF NOT EXISTS "care_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "care_needs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "healthcare_profile_specialities" (
	"healthcare_profile_id" uuid NOT NULL,
	"speciality_id" uuid NOT NULL
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
CREATE TABLE IF NOT EXISTS "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "languages_name_unique" UNIQUE("name")
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
CREATE INDEX IF NOT EXISTS "healthcare_profile_specialities_healthcare_profile_id_speciality_id_index" ON "healthcare_profile_specialities" USING btree ("healthcare_profile_id","speciality_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profile_care_needs_individual_profile_id_care_need_id_index" ON "individual_profile_care_needs" USING btree ("individual_profile_id","care_need_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_profile_languages_individual_profile_id_language_id_index" ON "individual_profile_languages" USING btree ("individual_profile_id","language_id");