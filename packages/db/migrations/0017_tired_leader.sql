ALTER TABLE "conversations" DROP CONSTRAINT "conversations_workspace_id_app_id_apps_workspace_id_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "app_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_app_id_apps_workspace_id_id_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE SET NULL ("app_id") ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION queue_conversation_files_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE attachments SET state = 'deleting', referenced = false, conversation_id = NULL, message_id = NULL
  WHERE workspace_id = OLD.workspace_id AND (
    (TG_TABLE_NAME = 'conversations' AND conversation_id = OLD.id) OR
    (TG_TABLE_NAME = 'conversation_messages' AND message_id = OLD.id)
  );
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER conversation_files_cleanup BEFORE DELETE ON conversations
FOR EACH ROW EXECUTE FUNCTION queue_conversation_files_cleanup();
--> statement-breakpoint
CREATE TRIGGER conversation_message_files_cleanup BEFORE DELETE ON conversation_messages
FOR EACH ROW EXECUTE FUNCTION queue_conversation_files_cleanup();
