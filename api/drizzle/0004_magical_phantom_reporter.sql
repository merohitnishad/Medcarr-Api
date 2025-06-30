CREATE TABLE IF NOT EXISTS "healthcare_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"healthcare_profile_id" uuid NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"sort_code" varchar(8) NOT NULL,
	"account_number" varchar(8) NOT NULL,
	"bank_name" varchar(255),
	"is_verified" boolean DEFAULT false NOT NULL,
	"encryption_key_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "healthcare_bank_details_healthcare_profile_id_unique" UNIQUE("healthcare_profile_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "healthcare_bank_details" ADD CONSTRAINT "healthcare_bank_details_healthcare_profile_id_healthcare_profiles_id_fk" FOREIGN KEY ("healthcare_profile_id") REFERENCES "public"."healthcare_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "healthcare_bank_details_profile_id_idx" ON "healthcare_bank_details" USING btree ("healthcare_profile_id");