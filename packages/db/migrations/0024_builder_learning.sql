CREATE TABLE "builder_learning" (
	"workspace_id" text NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"target_node_id" text NOT NULL,
	"baseline" text NOT NULL,
	"list_done" boolean DEFAULT false NOT NULL,
	"list_skipped" boolean DEFAULT false NOT NULL,
	"record_done" boolean DEFAULT false NOT NULL,
	"record_skipped" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "builder_learning_app_id_user_id_pk" PRIMARY KEY("app_id","user_id"),
	CONSTRAINT "builder_learning_steps_check" CHECK (NOT ("builder_learning"."list_done" AND "builder_learning"."list_skipped") AND NOT ("builder_learning"."record_done" AND "builder_learning"."record_skipped"))
);
--> statement-breakpoint
ALTER TABLE "builder_learning" ADD CONSTRAINT "builder_learning_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD CONSTRAINT "builder_learning_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;