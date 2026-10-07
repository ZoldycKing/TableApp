CREATE TABLE "import_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"sheet" text NOT NULL,
	"table_id" text,
	"table_name" text NOT NULL,
	"mode" text NOT NULL,
	"added" integer NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_runs_key_idx" ON "import_runs" USING btree ("workspace_id","run_id","sheet");--> statement-breakpoint
CREATE INDEX "import_runs_workspace_idx" ON "import_runs" USING btree ("workspace_id","created_at");