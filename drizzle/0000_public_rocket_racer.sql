CREATE TYPE "public"."c4_ical_status" AS ENUM('tentative', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."c4_permission_source" AS ENUM('oidc', 'manual');--> statement-breakpoint
CREATE TABLE "c4_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "c4_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"created_by_id" text,
	"summary" varchar(255) NOT NULL,
	"description" text,
	"url" varchar(1000),
	"location" varchar(500),
	"dtstart" timestamp with time zone NOT NULL,
	"dtend" timestamp with time zone,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"rrule" text,
	"recurrence_end_date" timestamp with time zone,
	"exdates" text,
	"frequency_label" varchar(255),
	"status" "c4_ical_status" DEFAULT 'confirmed' NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "c4_event_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(20),
	"is_internal" boolean DEFAULT false NOT NULL,
	"default_duration_minutes" integer,
	"space_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "c4_event_type_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "c4_occurrence_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"status" "c4_ical_status",
	"notes" text,
	"summary" varchar(255),
	"description" text,
	"url" varchar(1000),
	"location" varchar(500),
	"dtstart" timestamp with time zone,
	"dtend" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "c4_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "c4_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "c4_space" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "c4_space_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "c4_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "c4_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "c4_user_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"space_slug" varchar(100),
	"event_type_slug" varchar(100),
	"source" "c4_permission_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "c4_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "c4_account" ADD CONSTRAINT "c4_account_user_id_c4_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."c4_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_space_id_c4_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."c4_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_event_type_id_c4_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."c4_event_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event" ADD CONSTRAINT "c4_event_created_by_id_c4_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."c4_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_event_type" ADD CONSTRAINT "c4_event_type_space_id_c4_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."c4_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_occurrence_override" ADD CONSTRAINT "c4_occurrence_override_event_id_c4_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."c4_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_session" ADD CONSTRAINT "c4_session_user_id_c4_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."c4_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "c4_user_permission" ADD CONSTRAINT "c4_user_permission_user_id_c4_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."c4_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_space_idx" ON "c4_event" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "event_start_idx" ON "c4_event" USING btree ("dtstart");--> statement-breakpoint
CREATE INDEX "event_status_idx" ON "c4_event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_type_slug_idx" ON "c4_event_type" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "event_type_space_idx" ON "c4_event_type" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "occurrence_override_event_idx" ON "c4_occurrence_override" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "occurrence_override_event_date_idx" ON "c4_occurrence_override" USING btree ("event_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "space_slug_idx" ON "c4_space" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "user_permission_user_idx" ON "c4_user_permission" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_permission_space_slug_idx" ON "c4_user_permission" USING btree ("space_slug");--> statement-breakpoint
CREATE INDEX "user_permission_event_type_slug_idx" ON "c4_user_permission" USING btree ("event_type_slug");