CREATE TABLE "stock_automation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"checked" integer DEFAULT 0 NOT NULL,
	"created_tasks" integer DEFAULT 0 NOT NULL,
	"error" text,
	"finished_at" timestamp with time zone,
	CONSTRAINT "stock_automation_runs_status_check" CHECK ("stock_automation_runs"."status" in ('queued', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "stock_automation_runs_trigger_check" CHECK ("stock_automation_runs"."trigger" in ('schedule', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "stock_automations" (
	"workspace_id" text NOT NULL,
	"app_id" text PRIMARY KEY NOT NULL,
	"item_table_id" text NOT NULL,
	"minimum_field_id" text NOT NULL,
	"task_table_id" text NOT NULL,
	"task_fields" jsonb NOT NULL,
	"local_time" text NOT NULL,
	"time_zone" text NOT NULL,
	"next_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_automations_owned_key" ON "stock_automations" USING btree ("workspace_id","app_id");--> statement-breakpoint
ALTER TABLE "stock_automation_runs" ADD CONSTRAINT "stock_automation_runs_schedule_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."stock_automations"("workspace_id","app_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_automations" ADD CONSTRAINT "stock_automations_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_automation_runs_history_idx" ON "stock_automation_runs" USING btree ("app_id","scheduled_for" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_automation_runs_queue_idx" ON "stock_automation_runs" USING btree ("ready_at") WHERE "stock_automation_runs"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "stock_automation_runs_occurrence_key" ON "stock_automation_runs" USING btree ("app_id","scheduled_for") WHERE "stock_automation_runs"."trigger" = 'schedule';--> statement-breakpoint
CREATE UNIQUE INDEX "stock_automations_items_key" ON "stock_automations" USING btree ("workspace_id","item_table_id");--> statement-breakpoint
CREATE INDEX "stock_automations_due_idx" ON "stock_automations" USING btree ("next_run_at") WHERE "stock_automations"."next_run_at" is not null;
