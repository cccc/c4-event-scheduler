import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";

import { env } from "@/env";
import { db } from "@/server/db";
import { syncOidcRoles } from "./role-sync";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	emailAndPassword: {
		enabled: env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED,
	},
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					// Sync roles after session creation (covers both new and returning users)
					// The account info with tokens is stored, we can fetch and process it
					await syncOidcRoles(session.userId);
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
								scopes: env.OIDC_SCOPES.split(" ").filter(Boolean),
								pkce: true,
								mapProfileToUser: (profile) => {
									// Use preferred_username if available, otherwise fall back to name or email
									const name =
										profile.preferred_username ||
										profile.name ||
										profile.email ||
										"Unknown";
									return {
										name,
										email: profile.email,
										image: profile.picture,
										emailVerified: profile.email_verified ?? false,
									};
								},
							},
						],
					}),
				]
			: []),
	],
});

export type Session = typeof auth.$Infer.Session;
