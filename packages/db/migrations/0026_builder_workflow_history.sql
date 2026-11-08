CREATE TABLE "builder_workflow_runs" (
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
	CONSTRAINT "builder_workflow_runs_status_check" CHECK ("builder_workflow_runs"."status" in ('succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "builder_action_runs" ADD COLUMN "outcome" jsonb;--> statement-breakpoint
ALTER TABLE "builder_workflow_runs" ADD CONSTRAINT "builder_workflow_runs_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_workflow_runs" ADD CONSTRAINT "builder_workflow_runs_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builder_workflow_runs_history_idx" ON "builder_workflow_runs" USING btree ("app_id","user_id","created_at","id");