CREATE TABLE "c4_api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "c4_api_key_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"space_slug" varchar(100),
	"event_type_slug" varchar(100)
);
--> statement-breakpoint
ALTER TABLE "c4_event" ADD COLUMN "created_by_api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "c4_event" ADD COLUMN "updated_by_api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "c4_api_key_permission" ADD CONSTRAINT "c4_api_key_permission_api_key_id_c4_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."c4_api_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_created_by_api_key_id_c4_api_key_id_fk" FOREIGN KEY ("created_by_api_key_id") REFERENCES "public"."c4_api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_updated_by_api_key_id_c4_api_key_id_fk" FOREIGN KEY ("updated_by_api_key_id") REFERENCES "public"."c4_api_key"("id") ON DELETE set null ON UPDATE no action;