ALTER TYPE "public"."memory_kind" ADD VALUE 'assignment';--> statement-breakpoint
ALTER TABLE "recall_events" ADD COLUMN "attempt" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recall_events" ADD CONSTRAINT "recall_events_attempt_check" CHECK ("recall_events"."attempt" in (1, 2));