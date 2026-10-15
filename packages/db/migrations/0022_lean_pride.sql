CREATE TABLE "general_message_operators" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "general_message_operators_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "module_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "table_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "row_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "kind" text DEFAULT 'record' NOT NULL;--> statement-breakpoint
ALTER TABLE "general_message_operators" ADD CONSTRAINT "general_message_operators_workspace_id_user_id_workspace_members_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_general_customer_key" ON "conversations" USING btree ("workspace_id","customer_id") WHERE "conversations"."kind" = 'general';--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_target_check" CHECK (("conversations"."kind" = 'record' and "conversations"."module_id" is not null and "conversations"."table_id" is not null and "conversations"."row_id" is not null) or ("conversations"."kind" = 'general' and "conversations"."module_id" is null and "conversations"."table_id" is null and "conversations"."row_id" is null));