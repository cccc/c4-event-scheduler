import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    /**
     * Server-side environment variables schema. Validated at runtime so the app
     * isn't run with invalid env vars.
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
        // Override the OAuth redirect URI sent to the IdP. Defaults to
        // <BETTER_AUTH_URL>/api/auth/callback/oidc; set it to the pre-1.7 path
        // .../api/auth/oauth2/callback/oidc when that is what the IdP has
        // registered (a compatibility route forwards it).
        BETTER_AUTH_OIDC_REDIRECT_URI: z.url().optional(),
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
        // Public self-registration with email + password (requires
        // AUTH_EMAIL_ENABLED). Off by default: admins create local accounts.
        AUTH_EMAIL_SIGNUP_ENABLED: z
            .string()
            .default("false")
            .transform((v) => v === "true"),
        AUTH_SSO_ENABLED: z
            .string()
            .default("true")
            .transform((v) => v === "true"),
        AUTH_SSO_NAME: z.string().default("Single Sign-On"),
        // Treat every signed-in user as admin (API keys are unaffected). Dev/bootstrap aid.
        AUTH_ALL_USERS_ADMIN: z
            .string()
            .default("false")
            .transform((v) => v === "true"),
        // Verbosity of "[auth]" log lines: debug logs every permission check.
        AUTH_LOG_LEVEL: z
            .enum(["debug", "info", "warn", "error"])
            .default("info"),
        APP_URL: z.url().default("http://localhost:3000"),
        APP_TIMEZONE: z.string().default("UTC"),
    },

    /**
     * Client-side variables must be prefixed with `VITE_` to be exposed to the
     * browser. None are needed: server values the UI needs (timezone, auth
     * options) are handed down through the root route context instead, so they
     * stay runtime-configurable.
     */
    clientPrefix: "VITE_",
    client: {},

    /** Server vars are read from `process.env` (Node server). */
    runtimeEnv: process.env,

    /**
     * Run `build` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
     * useful for Docker builds.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,

    /**
     * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
     * `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true,
});
