ALTER TABLE "builder_learning" ADD COLUMN "access_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD COLUMN "access_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD COLUMN "publish_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD COLUMN "publish_skipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "builder_learning" ADD CONSTRAINT "builder_learning_publication_steps_check" CHECK (NOT ("builder_learning"."access_done" AND "builder_learning"."access_skipped") AND NOT ("builder_learning"."publish_done" AND "builder_learning"."publish_skipped"));