ALTER TABLE "builder_learning" ADD COLUMN "save_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD COLUMN "save_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD CONSTRAINT "builder_learning_save_step_check" CHECK (NOT ("builder_learning"."save_done" AND "builder_learning"."save_skipped"));