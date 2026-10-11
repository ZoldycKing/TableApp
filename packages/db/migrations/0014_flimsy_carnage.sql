CREATE TABLE "business_customer_apps" (
	"workspace_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"app_id" text NOT NULL,
	CONSTRAINT "business_customer_apps_customer_id_app_id_pk" PRIMARY KEY("customer_id","app_id")
);
--> statement-breakpoint
CREATE TABLE "business_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "business_customers_owned_key" ON "business_customers" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "business_customer_apps" ADD CONSTRAINT "business_customer_apps_owned_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."business_customers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_customer_apps" ADD CONSTRAINT "business_customer_apps_owned_app_fk" FOREIGN KEY ("workspace_id","app_id") REFERENCES "public"."apps"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_customers" ADD CONSTRAINT "business_customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_customers_email_key" ON "business_customers" USING btree ("workspace_id","email");
