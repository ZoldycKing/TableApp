CREATE TABLE "order_deliveries" (
	"workspace_id" text NOT NULL,
	"order_table_id" text NOT NULL,
	"order_row_id" text NOT NULL,
	"delivery_table_id" text NOT NULL,
	"delivery_row_id" text NOT NULL,
	"contract" jsonb NOT NULL,
	"order_status_before" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_deliveries_workspace_id_order_table_id_order_row_id_pk" PRIMARY KEY("workspace_id","order_table_id","order_row_id")
);
--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_table_fk" FOREIGN KEY ("workspace_id","order_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_delivery_table_fk" FOREIGN KEY ("workspace_id","delivery_table_id") REFERENCES "public"."tables"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_row_fk" FOREIGN KEY ("order_table_id","order_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_delivery_row_fk" FOREIGN KEY ("delivery_table_id","delivery_row_id") REFERENCES "public"."rows"("table_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_deliveries_delivery_key" ON "order_deliveries" USING btree ("workspace_id","delivery_table_id","delivery_row_id");