CREATE TABLE "c4_actor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"api_key_id" uuid,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "c4_actor_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "c4_actor_api_key_id_unique" UNIQUE("api_key_id")
);
--> statement-breakpoint
CREATE TABLE "c4_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"space_slug" varchar(100),
	"event_type_slug" varchar(100),
	"source" "c4_permission_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Backfill actors for all existing users (carry over is_admin)
INSERT INTO c4_actor (id, kind, user_id, is_admin, created_at)
SELECT gen_random_uuid(), 'user', id, is_admin, created_at FROM c4_user
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Backfill actors for all existing API keys (carry over is_admin)
INSERT INTO c4_actor (id, kind, api_key_id, is_admin, created_at)
SELECT gen_random_uuid(), 'apiKey', id, is_admin, created_at FROM c4_api_key
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Migrate user permissions to unified permission table
INSERT INTO c4_permission (id, actor_id, space_slug, event_type_slug, source, created_at)
SELECT up.id, a.id, up.space_slug, up.event_type_slug, up.source, up.created_at
FROM c4_user_permission up
JOIN c4_actor a ON a.user_id = up.user_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Migrate API key permissions to unified permission table
INSERT INTO c4_permission (id, actor_id, space_slug, event_type_slug, source, created_at)
SELECT akp.id, a.id, akp.space_slug, akp.event_type_slug, 'manual', NOW()
FROM c4_api_key_permission akp
JOIN c4_actor a ON a.api_key_id = akp.api_key_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "c4_api_key_permission" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "c4_user_permission" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "c4_api_key_permission" CASCADE;--> statement-breakpoint
DROP TABLE "c4_user_permission" CASCADE;--> statement-breakpoint
ALTER TABLE "c4_event" DROP CONSTRAINT "c4_event_created_by_id_c4_user_id_fk";
--> statement-breakpoint
ALTER TABLE "c4_event" DROP CONSTRAINT "c4_event_updated_by_id_c4_user_id_fk";
--> statement-breakpoint
ALTER TABLE "c4_event" DROP CONSTRAINT "c4_event_created_by_api_key_id_c4_api_key_id_fk";
--> statement-breakpoint
ALTER TABLE "c4_event" DROP CONSTRAINT "c4_event_updated_by_api_key_id_c4_api_key_id_fk";
--> statement-breakpoint
ALTER TABLE "c4_event" ADD COLUMN "created_by_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "c4_event" ADD COLUMN "updated_by_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "c4_actor" ADD CONSTRAINT "c4_actor_user_id_c4_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."c4_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_actor" ADD CONSTRAINT "c4_actor_api_key_id_c4_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."c4_api_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_permission" ADD CONSTRAINT "c4_permission_actor_id_c4_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."c4_actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permission_actor_idx" ON "c4_permission" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "permission_space_slug_idx" ON "c4_permission" USING btree ("space_slug");--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_created_by_actor_id_c4_actor_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."c4_actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_updated_by_actor_id_c4_actor_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."c4_actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill event created_by_actor_id from old user/apiKey FK columns
UPDATE c4_event e SET created_by_actor_id = a.id FROM c4_actor a WHERE a.user_id = e.created_by_id AND e.created_by_id IS NOT NULL;--> statement-breakpoint
UPDATE c4_event e SET created_by_actor_id = a.id FROM c4_actor a WHERE a.api_key_id = e.created_by_api_key_id AND e.created_by_api_key_id IS NOT NULL;--> statement-breakpoint
-- Backfill event updated_by_actor_id from old user/apiKey FK columns
UPDATE c4_event e SET updated_by_actor_id = a.id FROM c4_actor a WHERE a.user_id = e.updated_by_id AND e.updated_by_id IS NOT NULL;--> statement-breakpoint
UPDATE c4_event e SET updated_by_actor_id = a.id FROM c4_actor a WHERE a.api_key_id = e.updated_by_api_key_id AND e.updated_by_api_key_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "c4_api_key" DROP COLUMN "is_admin";--> statement-breakpoint
ALTER TABLE "c4_event" DROP COLUMN "created_by_id";--> statement-breakpoint
ALTER TABLE "c4_event" DROP COLUMN "updated_by_id";--> statement-breakpoint
ALTER TABLE "c4_event" DROP COLUMN "created_by_api_key_id";--> statement-breakpoint
ALTER TABLE "c4_event" DROP COLUMN "updated_by_api_key_id";--> statement-breakpoint
ALTER TABLE "c4_user" DROP COLUMN "is_admin";
