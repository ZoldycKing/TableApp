CREATE TABLE "pending_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"screen_id" text NOT NULL,
	"table_id" text NOT NULL,
	"values" jsonb NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pending_submissions" ADD CONSTRAINT "pending_submissions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_submissions_app_idx" ON "pending_submissions" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "pending_submissions_expires_idx" ON "pending_submissions" USING btree ("expires_at");