CREATE TABLE "c4_api_key_secret" (
	"api_key_id" uuid PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	CONSTRAINT "c4_api_key_secret_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "c4_api_key_secret" ADD CONSTRAINT "c4_api_key_secret_api_key_id_c4_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."c4_api_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "c4_api_key_secret" ("api_key_id", "key_hash") SELECT "id", "key_hash" FROM "c4_api_key";--> statement-breakpoint
ALTER TABLE "c4_api_key" ADD COLUMN "fingerprint" text;--> statement-breakpoint
UPDATE "c4_api_key" SET "fingerprint" = left("key_hash", 8);--> statement-breakpoint
ALTER TABLE "c4_api_key" ALTER COLUMN "fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "c4_api_key" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "c4_api_key" ADD CONSTRAINT "c4_api_key_user_id_c4_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."c4_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "c4_api_key" DROP COLUMN "key_hash";