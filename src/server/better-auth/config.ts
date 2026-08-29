import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { env } from "@/env";
import { authLog } from "@/server/auth-log";
import { db } from "@/server/db";
import { actor } from "@/server/db/schema";
import { syncOidcRoles } from "./role-sync";

if (env.AUTH_EMAIL_ENABLED && env.AUTH_EMAIL_SIGNUP_ENABLED) {
    authLog.warn(
        env.AUTH_ALL_USERS_ADMIN
            ? "AUTH_EMAIL_SIGNUP_ENABLED and AUTH_ALL_USERS_ADMIN are both on: anyone who registers becomes an admin"
            : "AUTH_EMAIL_SIGNUP_ENABLED is on: anyone can register a local account",
    );
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    emailAndPassword: {
        enabled: env.AUTH_EMAIL_ENABLED,
        // Local accounts are normally created by admins (see fns/users.ts);
        // /api/auth/sign-up/email is only open when explicitly enabled.
        disableSignUp: !env.AUTH_EMAIL_SIGNUP_ENABLED,
        minPasswordLength: 8,
    },
    // Route BetterAuth's own diagnostics (OAuth callback failures, state
    // mismatches, adapter errors, ...) through the auth log.
    logger: {
        level: env.AUTH_LOG_LEVEL,
        log: (level, message, ...args) => {
            authLog[level](
                `better-auth: ${message}`,
                args.length > 0 ? { details: args } : undefined,
            );
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (newUser) => {
                    authLog.info("user created", {
                        userId: newUser.id,
                        email: newUser.email,
                        name: newUser.name,
                    });
                    await db
                        .insert(actor)
                        .values({ kind: "user", userId: newUser.id });
                },
            },
        },
        session: {
            create: {
                after: async (session) => {
                    authLog.info("login: session created", {
                        userId: session.userId,
                        sessionId: session.id,
                        ip: session.ipAddress ?? undefined,
                        allUsersAdmin: env.AUTH_ALL_USERS_ADMIN || undefined,
                    });
                    // Sync roles after session creation (covers both new and returning users)
                    // The account info with tokens is stored, we can fetch and process it
                    try {
                        await syncOidcRoles(session.userId);
                    } catch (error) {
                        authLog.error("role sync failed", {
                            userId: session.userId,
                            error,
                        });
                        throw error;
                    }
                },
            },
        },
    },
    plugins: [
        // SSO via generic OAuth/OIDC (e.g., Keycloak, Authentik, etc.)
        ...(env.BETTER_AUTH_OIDC_CLIENT_ID &&
        env.BETTER_AUTH_OIDC_CLIENT_SECRET &&
        env.BETTER_AUTH_OIDC_ISSUER
            ? [
                  genericOAuth({
                      config: [
                          {
                              providerId: "oidc",
                              discoveryUrl: `${env.BETTER_AUTH_OIDC_ISSUER}/.well-known/openid-configuration`,
                              clientId: env.BETTER_AUTH_OIDC_CLIENT_ID,
                              clientSecret: env.BETTER_AUTH_OIDC_CLIENT_SECRET,
                              scopes: env.OIDC_SCOPES.split(" ").filter(
                                  Boolean,
                              ),
                              pkce: true,
                              redirectURI: env.BETTER_AUTH_OIDC_REDIRECT_URI,
                              // better-auth 1.7 keys accounts by (issuer,
                              // accountId) and would default the issuer to
                              // the discovered IdP URL. Pin the synthetic
                              // namespace instead so it stays stable across
                              // IdP moves and matches what migration 0005
                              // backfilled for pre-1.7 accounts.
                              accountIssuer: "local:oauth:oidc",
                              // better-auth 1.7 would also log the user out at
                              // the IdP (RP-initiated logout) on signOut. Keep
                              // the pre-1.7 local-only logout; to enable it,
                              // drop this and set postLogoutRedirectURI to a URI
                              // registered with the provider.
                              disableProviderLogout: true,
                              mapProfileToUser: (profile) => {
                                  authLog.debug("oidc profile received", {
                                      sub: profile.sub,
                                      email: profile.email,
                                      preferredUsername:
                                          profile.preferred_username,
                                      emailVerified: profile.email_verified,
                                  });
                                  // Claims are untyped (unknown); use preferred_username
                                  // if available, otherwise fall back to name or email
                                  const str = (v: unknown) =>
                                      typeof v === "string" && v.length > 0
                                          ? v
                                          : undefined;
                                  const name =
                                      str(profile.preferred_username) ??
                                      str(profile.name) ??
                                      str(profile.email) ??
                                      "Unknown";
                                  return {
                                      name,
                                      email: profile.email,
                                      image: str(profile.picture),
                                      emailVerified:
                                          profile.email_verified === true,
                                  };
                              },
                          },
                      ],
                  }),
              ]
            : []),
        // Must come last so it can forward Set-Cookie headers from the other
        // plugins through Start's server runtime.
        tanstackStartCookies(),
    ],
});

export type Session = typeof auth.$Infer.Session;
