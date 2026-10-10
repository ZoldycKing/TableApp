CREATE TABLE "workspace_client_apps" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "apps_workspace_id_key" ON "apps" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "workspace_client_apps" ADD CONSTRAINT "workspace_client_apps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_client_apps" ADD CONSTRAINT "workspace_client_apps_owned_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
