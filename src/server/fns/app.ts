import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { actor } from "@/server/db/schema";
import { resolveUserIsAdmin } from "@/server/permissions";

/**
 * Everything the root route needs per request: the session, whether the user
 * is an admin (for the header), and the runtime-configured values the UI needs
 * (timezone, which login methods to offer). Resolved once in the root
 * `beforeLoad` and read from route context everywhere else.
 */
export const getAppContext = createServerFn({ method: "GET" }).handler(
    async () => {
        const session = await auth.api.getSession({
            headers: getRequestHeaders(),
        });

        let isAdmin = false;
        if (session?.user) {
            const actorRecord = await db.query.actor.findFirst({
                where: eq(actor.userId, session.user.id),
                columns: { isAdmin: true },
            });
            isAdmin = resolveUserIsAdmin(actorRecord?.isAdmin);
        }

        return {
            session,
            isAdmin,
            timezone: env.APP_TIMEZONE,
            auth: {
                emailEnabled: env.AUTH_EMAIL_ENABLED,
                signupEnabled:
                    env.AUTH_EMAIL_ENABLED && env.AUTH_EMAIL_SIGNUP_ENABLED,
                ssoEnabled: env.AUTH_SSO_ENABLED,
                ssoName: env.AUTH_SSO_NAME,
            },
        };
    },
);
