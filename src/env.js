import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        BETTER_AUTH_URL: z.url(),
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
        AUTH_EMAIL_ENABLED: z
            .string()
            .default("false")
            .transform((v) => v === "true"),
        AUTH_SSO_ENABLED: z
            .string()
            .default("true")
            .transform((v) => v === "true"),
        AUTH_SSO_NAME: z.string().default("Single Sign-On"),
        APP_URL: z.url().default("http://localhost:3000"),
        APP_TIMEZONE: z.string().default("UTC"),
    },

    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     *
     * Keep this list empty when possible — every `NEXT_PUBLIC_*` value is
     * baked into the client bundle at build time, so changing it requires a
     * rebuild rather than a container restart. Prefer server-only vars and
     * either pass through props from a server component or expose them via a
     * client context populated from an SSR read.
     */
    client: {},

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        AUTH_EMAIL_ENABLED: process.env.AUTH_EMAIL_ENABLED,
        AUTH_SSO_ENABLED: process.env.AUTH_SSO_ENABLED,
        AUTH_SSO_NAME: process.env.AUTH_SSO_NAME,
        APP_URL: process.env.APP_URL,
        APP_TIMEZONE: process.env.APP_TIMEZONE,
        BETTER_AUTH_OIDC_CLIENT_ID: process.env.BETTER_AUTH_OIDC_CLIENT_ID,
        BETTER_AUTH_OIDC_CLIENT_SECRET:
            process.env.BETTER_AUTH_OIDC_CLIENT_SECRET,
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
