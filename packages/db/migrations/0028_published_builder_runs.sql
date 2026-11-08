CREATE UNIQUE INDEX "app_users_app_id_key" ON "app_users" USING btree ("app_id","id");
--> statement-breakpoint
CREATE TABLE "app_action_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"definition_revision" text NOT NULL,
	"workflow_id" text NOT NULL,
	"event_node_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"table_id" text,
	"row_id" text,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"workflow_name" text NOT NULL,
	"event_node_id" text NOT NULL,
	"definition_revision" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"trace" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_workflow_runs_status_check" CHECK ("app_workflow_runs"."status" in ('succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app_action_runs" ADD CONSTRAINT "app_action_runs_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_action_runs" ADD CONSTRAINT "app_action_runs_user_fk" FOREIGN KEY ("app_id","user_id") REFERENCES "public"."app_users"("app_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_workflow_runs" ADD CONSTRAINT "app_workflow_runs_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_workflow_runs" ADD CONSTRAINT "app_workflow_runs_user_fk" FOREIGN KEY ("app_id","user_id") REFERENCES "public"."app_users"("app_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_action_runs_retry_key" ON "app_action_runs" USING btree ("app_id","user_id","request_id");--> statement-breakpoint
CREATE INDEX "app_workflow_runs_history_idx" ON "app_workflow_runs" USING btree ("app_id","user_id","created_at","id");--> statement-breakpoint
