CREATE TABLE IF NOT EXISTS "healthcare_profile_languages" (
	"healthcare_profile_id" uuid NOT NULL,
	"language_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "healthcare_profiles" ADD COLUMN "about_me" text NOT NULL;--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "healthcare_profile_languages_healthcare_profile_id_language_id_index" ON "healthcare_profile_languages" USING btree ("healthcare_profile_id","language_id");