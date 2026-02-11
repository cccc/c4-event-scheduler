import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		BETTER_AUTH_BASE_URL: z.url(),
		BETTER_AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		BETTER_AUTH_OIDC_CLIENT_ID: z.string().optional(),
		BETTER_AUTH_OIDC_CLIENT_SECRET: z.string().optional(),
		BETTER_AUTH_OIDC_ISSUER: z.string().url().optional(),
		OIDC_CLAIM_PREFIX: z.string().default("c4"),
		OIDC_SCOPES: z.string().default("openid profile email"),
		OIDC_ROLES_CLAIM: z.string().default("realm_access.roles"),
		DATABASE_URL: z.url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_AUTH_EMAIL_ENABLED: z
			.string()
			.default("false")
			.transform((v) => v === "true"),
		NEXT_PUBLIC_AUTH_SSO_ENABLED: z
			.string()
			.default("true")
			.transform((v) => v === "true"),
		NEXT_PUBLIC_AUTH_SSO_NAME: z.string().default("Single Sign-On"),
		NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		NEXT_PUBLIC_AUTH_EMAIL_ENABLED: process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED,
		NEXT_PUBLIC_AUTH_SSO_ENABLED: process.env.NEXT_PUBLIC_AUTH_SSO_ENABLED,
		NEXT_PUBLIC_AUTH_SSO_NAME: process.env.NEXT_PUBLIC_AUTH_SSO_NAME,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
		BETTER_AUTH_OIDC_CLIENT_ID: process.env.BETTER_AUTH_OIDC_CLIENT_ID,
		BETTER_AUTH_OIDC_CLIENT_SECRET: process.env.BETTER_AUTH_OIDC_CLIENT_SECRET,
		BETTER_AUTH_OIDC_ISSUER: process.env.BETTER_AUTH_OIDC_ISSUER,
		OIDC_CLAIM_PREFIX: process.env.OIDC_CLAIM_PREFIX,
		OIDC_SCOPES: process.env.OIDC_SCOPES,
		OIDC_ROLES_CLAIM: process.env.OIDC_ROLES_CLAIM,
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
