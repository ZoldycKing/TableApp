CREATE TABLE "workspace_usage" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"tables" integer DEFAULT 0 NOT NULL,
	"published_apps" integer DEFAULT 0 NOT NULL,
	"file_bytes" bigint DEFAULT 0 NOT NULL,
	"app_users" integer DEFAULT 0 NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_usage" ADD CONSTRAINT "workspace_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;