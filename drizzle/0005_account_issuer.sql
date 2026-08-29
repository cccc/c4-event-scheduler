-- better-auth 1.7 identifies accounts by (issuer, account_id). Backfill existing
-- rows with the synthetic namespaces better-auth uses for credential accounts
-- and that src/server/better-auth/config.ts pins for the OIDC provider
-- (accountIssuer), then enforce the constraint.
ALTER TABLE "c4_account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "c4_account" SET "issuer" = 'local:credential', "account_id" = "user_id" WHERE "provider_id" = 'credential';--> statement-breakpoint
UPDATE "c4_account" SET "issuer" = 'local:oauth:' || "provider_id" WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "c4_account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_idx" ON "c4_account" USING btree ("issuer","account_id");
