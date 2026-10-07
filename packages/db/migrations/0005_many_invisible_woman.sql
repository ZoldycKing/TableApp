ALTER TABLE "app_users" ADD COLUMN "role_id" text;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "joined_via" text DEFAULT 'invite' NOT NULL;