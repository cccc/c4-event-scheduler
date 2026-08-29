import { createAuthClient } from "better-auth/react";

// Generic OAuth providers (our "oidc" provider) are first-class social
// providers since better-auth 1.7, so no client plugin is needed:
// sign in with `authClient.signIn.social({ provider: "oidc" })`.
export const authClient = createAuthClient();

export type Session = typeof authClient.$Infer.Session;
