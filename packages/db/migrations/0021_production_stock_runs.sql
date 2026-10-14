CREATE TABLE "production_stock_runs" (
	"workspace_id" text NOT NULL,
	"production_table_id" text NOT NULL,
	"run_row_id" text NOT NULL,
	"product_table_id" text NOT NULL,
	"product_row_id" text NOT NULL,
	"stock_movement_table_id" text NOT NULL,
	"stock_movement_row_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"output_quantity" integer NOT NULL,
	"contract" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_stock_runs_workspace_id_production_table_id_run_row_id_pk" PRIMARY KEY("workspace_id","production_table_id","run_row_id"),
	CONSTRAINT "production_stock_quantity_check" CHECK ("production_stock_runs"."output_quantity">0),
	CONSTRAINT "production_stock_payload_hash_check" CHECK ("production_stock_runs"."payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_run_table_fk" FOREIGN KEY ("workspace_id","production_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_product_table_fk" FOREIGN KEY ("workspace_id","product_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_receipt_table_fk" FOREIGN KEY ("workspace_id","stock_movement_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_run_row_fk" FOREIGN KEY ("production_table_id","run_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_product_row_fk" FOREIGN KEY ("product_table_id","product_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_runs" ADD CONSTRAINT "production_stock_receipt_row_fk" FOREIGN KEY ("stock_movement_table_id","stock_movement_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_stock_receipt_key" ON "production_stock_runs" USING btree ("workspace_id","stock_movement_table_id","stock_movement_row_id");--> statement-breakpoint
CREATE INDEX "production_stock_product_idx" ON "production_stock_runs" USING btree ("workspace_id","product_table_id","product_row_id");