CREATE TABLE "order_stock_items" (
	"workspace_id" text NOT NULL,
	"order_table_id" text NOT NULL,
	"order_row_id" text NOT NULL,
	"product_table_id" text NOT NULL,
	"product_row_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"position_ids" jsonb NOT NULL,
	"issue_movement_id" text,
	"return_movement_id" text,
	CONSTRAINT "order_stock_items_workspace_id_order_table_id_order_row_id_product_row_id_pk" PRIMARY KEY("workspace_id","order_table_id","order_row_id","product_row_id"),
	CONSTRAINT "order_stock_quantity_check" CHECK ("order_stock_items"."quantity">0)
);
--> statement-breakpoint
CREATE TABLE "order_stock_reservations" (
	"workspace_id" text NOT NULL,
	"order_table_id" text NOT NULL,
	"order_row_id" text NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"contract" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_stock_reservations_workspace_id_order_table_id_order_row_id_pk" PRIMARY KEY("workspace_id","order_table_id","order_row_id"),
	CONSTRAINT "order_stock_state_check" CHECK ("order_stock_reservations"."state" in ('reserved','released','issued','returned'))
);
--> statement-breakpoint
ALTER TABLE "order_stock_items" ADD CONSTRAINT "order_stock_items_workspace_id_order_table_id_order_row_id_order_stock_reservations_workspace_id_order_table_id_order_row_id_fk" FOREIGN KEY ("workspace_id","order_table_id","order_row_id") REFERENCES "public"."order_stock_reservations"("workspace_id","order_table_id","order_row_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_items" ADD CONSTRAINT "order_stock_items_workspace_id_product_table_id_tables_workspace_id_id_fk" FOREIGN KEY ("workspace_id","product_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_items" ADD CONSTRAINT "order_stock_items_product_table_id_product_row_id_rows_table_id_id_fk" FOREIGN KEY ("product_table_id","product_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_reservations" ADD CONSTRAINT "order_stock_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_reservations" ADD CONSTRAINT "order_stock_reservations_workspace_id_order_table_id_tables_workspace_id_id_fk" FOREIGN KEY ("workspace_id","order_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_reservations" ADD CONSTRAINT "order_stock_reservations_order_table_id_order_row_id_rows_table_id_id_fk" FOREIGN KEY ("order_table_id","order_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_stock_product_idx" ON "order_stock_items" USING btree ("workspace_id","product_table_id","product_row_id");