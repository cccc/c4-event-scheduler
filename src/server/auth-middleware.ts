import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { authLog } from "@/server/auth-log";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { actor } from "@/server/db/schema";
import { forbidden, unauthorized } from "@/server/fn-errors";
import {
    type Actor,
    describeActor,
    resolveUserIsAdmin,
} from "@/server/permissions";

/**
 * Loads the session (if any) and the matching actor row with its permissions.
 * `actor` is null for anonymous requests. Mirrors the old tRPC context +
 * `publicProcedure`: use this for reads that behave differently when signed in.
 *
 *   export const list = createServerFn({ method: "GET" })
 *       .middleware([withActor])
 *       .handler(async ({ context }) => { context.actor?.isAdmin ... });
 */
export const withActor = createMiddleware({ type: "function" }).server(
    async ({ next }) => {
        const session = await auth.api.getSession({
            headers: getRequestHeaders(),
        });

        let currentActor: Actor | null = null;
        if (session?.user) {
            // One DB query: actor row + permissions + isAdmin
            const actorRecord = await db.query.actor.findFirst({
                where: eq(actor.userId, session.user.id),
                with: { permissions: true },
            });

            if (!actorRecord) {
                authLog.warn("no actor row for signed-in user", {
                    userId: session.user.id,
                });
            }

            currentActor = {
                kind: "user",
                id: session.user.id,
                actorId: actorRecord?.id,
                isAdmin: resolveUserIsAdmin(actorRecord?.isAdmin),
                permissions: actorRecord?.permissions ?? [],
            };
        }

        return next({ context: { db, session, actor: currentActor } });
    },
);

/**
 * Requires a signed-in user; mirrors the old `protectedProcedure`. The handler
 * context gets a non-null `session`, `user` and `actor`.
 */
export const authed = createMiddleware({ type: "function" })
    .middleware([withActor])
    .server(async ({ next, context }) => {
        if (!context.session?.user || !context.actor) {
            authLog.warn("server fn unauthorized: no session");
            throw unauthorized();
        }
        return next({
            context: {
                session: context.session,
                user: context.session.user,
                actor: context.actor,
            },
        });
    });

/** `authed` plus the admin flag; mirrors the old `adminProcedure`. */
export const admin = createMiddleware({ type: "function" })
    .middleware([authed])
    .server(async ({ next, context }) => {
        if (!context.actor.isAdmin) {
            authLog.warn("server fn admin access denied", {
                ...describeActor(context.actor),
            });
            throw forbidden("Access denied. Admin privileges required.");
        }
        return next();
    });
