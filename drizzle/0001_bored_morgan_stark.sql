ALTER TABLE "c4_event" ADD COLUMN "location" varchar(500);--> statement-breakpoint
ALTER TABLE "c4_event_type" ADD COLUMN "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "c4_occurrence_override" ADD COLUMN "location" varchar(500);