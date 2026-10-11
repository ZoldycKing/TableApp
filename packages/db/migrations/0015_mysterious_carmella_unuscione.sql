CREATE TABLE "app_config_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"number" integer NOT NULL,
	"kind" text NOT NULL,
	"definition" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_config_versions" ADD CONSTRAINT "app_config_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config_versions" ADD CONSTRAINT "app_config_versions_owned_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_config_versions_number_key" ON "app_config_versions" USING btree ("app_id","number");