import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { authed } from "@/server/auth-middleware";
import { account } from "@/server/db/schema";

/**
 * How the current user signs in: local users have a "credential" account
 * (email + password), SSO users an "oidc" one. Drives the self-service
 * account page (password change is only offered to local users).
 */
export const getAccountInfo = createServerFn({ method: "GET" })
    .middleware([authed])
    .handler(async ({ context }) => {
        const accounts = await context.db.query.account.findMany({
            where: eq(account.userId, context.user.id),
            columns: { providerId: true },
        });
        const providers = accounts.map((a) => a.providerId);
        return {
            providers,
            hasPassword: providers.includes("credential"),
        };
    });
