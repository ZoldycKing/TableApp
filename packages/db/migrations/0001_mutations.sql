CREATE TABLE "mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"actor_id" text,
	"actor_kind" text DEFAULT 'member' NOT NULL,
	"table_id" text NOT NULL,
	"row_id" text NOT NULL,
	"field_id" text,
	"op" text NOT NULL,
	"base" jsonb,
	"next" jsonb,
	"status" text NOT NULL,
	"reason" text,
	"client_at" timestamp with time zone,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mutations_row_idx" ON "mutations" USING btree ("row_id","applied_at");--> statement-breakpoint
CREATE INDEX "mutations_device_idx" ON "mutations" USING btree ("device_id","applied_at");