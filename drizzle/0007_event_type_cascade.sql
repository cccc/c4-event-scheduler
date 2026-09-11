ALTER TABLE "c4_event" DROP CONSTRAINT "c4_event_event_type_id_c4_event_type_id_fk";
--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_event_type_id_c4_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."c4_event_type"("id") ON DELETE cascade ON UPDATE no action;