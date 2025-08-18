-- STEP 1: Add the dispute_id column first
ALTER TABLE "notifications" ADD COLUMN "dispute_id" uuid;
--> statement-breakpoint

-- STEP 2: Then add the foreign key constraint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- STEP 3: Create the index
CREATE INDEX IF NOT EXISTS "notifications_dispute_id_idx" ON "notifications" USING btree ("dispute_id");