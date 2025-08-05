CREATE TABLE IF NOT EXISTS "job_application_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_application_id" uuid NOT NULL,
	"preference_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE INDEX IF NOT EXISTS "job_application_preferences_application_id_idx" ON "job_application_preferences" USING btree ("job_application_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_application_preferences_preference_id_idx" ON "job_application_preferences" USING btree ("preference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unique_job_application_preference" ON "job_application_preferences" USING btree ("job_application_id","preference_id");