CREATE SEQUENCE "public"."row_sync_revision_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "rows" ADD COLUMN "sync_revision" bigint DEFAULT nextval('row_sync_revision_seq') NOT NULL;--> statement-breakpoint
CREATE INDEX "rows_table_sync_idx" ON "rows" USING btree ("table_id","sync_revision");