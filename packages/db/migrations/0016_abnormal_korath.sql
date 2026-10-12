CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"sequence" bigserial NOT NULL,
	"author_id" text NOT NULL,
	"author_kind" text NOT NULL,
	"author_name" text NOT NULL,
	"request_id" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"message_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"operation" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"module_id" text NOT NULL,
	"table_id" text NOT NULL,
	"row_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "message_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_owned_key" ON "conversation_messages" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_owned_key" ON "conversations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "rows_owned_key" ON "rows" USING btree ("table_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tables_owned_key" ON "tables" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_workspace_id_conversation_id_conversations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_workspace_id_conversation_id_conversations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_revisions" ADD CONSTRAINT "conversation_revisions_workspace_id_message_id_conversation_messages_workspace_id_id_fk" FOREIGN KEY ("workspace_id","message_id") REFERENCES "public"."conversation_messages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_app_id_apps_workspace_id_id_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_table_id_tables_workspace_id_id_fk" FOREIGN KEY ("workspace_id","table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_table_id_row_id_rows_table_id_id_fk" FOREIGN KEY ("table_id","row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_customer_id_business_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."business_customers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_retry_key" ON "conversation_messages" USING btree ("conversation_id","author_id","request_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_page_idx" ON "conversation_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_messages_workspace_idx" ON "conversation_messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_notes_retry_key" ON "conversation_notes" USING btree ("conversation_id","author_id","request_id");--> statement-breakpoint
CREATE INDEX "conversation_notes_page_idx" ON "conversation_notes" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_notes_workspace_idx" ON "conversation_notes" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_revisions_version_key" ON "conversation_revisions" USING btree ("message_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_resource_customer_key" ON "conversations" USING btree ("workspace_id","table_id","row_id","customer_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_conversation_id_conversations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_message_id_conversation_messages_workspace_id_id_fk" FOREIGN KEY ("workspace_id","message_id") REFERENCES "public"."conversation_messages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
