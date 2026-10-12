CREATE TABLE "conversation_reads" (
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"sequence" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_reads_workspace_id_conversation_id_actor_id_pk" PRIMARY KEY("workspace_id","conversation_id","actor_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_workspace_id_conversation_id_conversations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;