CREATE TABLE "c4_feed_token" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "c4_feed_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "c4_feed_token" ADD CONSTRAINT "c4_feed_token_user_id_c4_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."c4_user"("id") ON DELETE cascade ON UPDATE no action;