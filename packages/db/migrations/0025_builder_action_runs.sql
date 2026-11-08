CREATE TABLE "builder_action_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"definition_revision" text NOT NULL,
	"workflow_id" text NOT NULL,
	"event_node_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"table_id" text NOT NULL,
	"row_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_action_runs" ADD CONSTRAINT "builder_action_runs_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_action_runs" ADD CONSTRAINT "builder_action_runs_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "builder_action_runs_retry_key" ON "builder_action_runs" USING btree ("app_id","user_id","request_id");