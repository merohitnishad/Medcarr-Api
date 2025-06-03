DO $$ BEGIN
 CREATE TYPE "public"."role" AS ENUM('admin', 'individual', 'organization', 'healthcare');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE role;