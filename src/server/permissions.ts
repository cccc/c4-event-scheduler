import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { actor, permission } from "@/server/db/schema";

export type Permission = {
    spaceSlug: string | null;
    eventTypeSlug: string | null;
};

export type Actor = {
    kind: "user" | "apiKey";
    id: string;
    actorId: string | undefined; // actor row UUID — used for createdByActorId / updatedByActorId
    isAdmin: boolean;
    permissions: Permission[];
};

export type PermissionScope = {
    spaceSlug?: string;
    eventTypeSlug?: string;
};

// ─── Core check (pure, sync) ────────────────────────────────────────────────

/**
 * Check if an actor has permission for a given scope.
 *
 * Permission hierarchy:
 * - isAdmin=true → full access to everything
 * - Global permission (both slugs null) → access to all spaces/event-types
 * - Space permission (spaceSlug set) → access to that space and all its event types
 * - EventType permission (eventTypeSlug set) → access to that event type in all spaces
 * - Scoped permission (both set) → access only to that event type in that space
 */
export function can(
    actorArg: Actor,
    _action: string,
    scope: PermissionScope = {},
): boolean {
    if (actorArg.isAdmin) return true;

    for (const perm of actorArg.permissions) {
        // Global permission (both null)
        if (perm.spaceSlug === null && perm.eventTypeSlug === null) return true;

        if (scope.spaceSlug) {
            // Space-level permission (covers all event types in that space)
            if (
                perm.spaceSlug === scope.spaceSlug &&
                perm.eventTypeSlug === null
            )
                return true;

            if (scope.eventTypeSlug) {
                // Scoped permission (specific event type in specific space)
                if (
                    perm.spaceSlug === scope.spaceSlug &&
                    perm.eventTypeSlug === scope.eventTypeSlug
                )
                    return true;
            }
        }

        if (scope.eventTypeSlug) {
            // Global event type permission (covers this event type in all spaces)
            if (
                perm.spaceSlug === null &&
                perm.eventTypeSlug === scope.eventTypeSlug
            )
                return true;
        }
    }

    return false;
}

/** Throws TRPCError if not allowed (for use inside tRPC procedures) */
export function assertCan(
    actorArg: Actor,
    action: string,
    scope?: PermissionScope,
): void {
    if (!can(actorArg, action, scope)) {
        throw new TRPCError({ code: "FORBIDDEN" });
    }
}

// ─── Actor builders ─────────────────────────────────────────────────────────

/** For use outside tRPC (e.g., scripts). tRPC uses protectedProcedure's actorRecord directly. */
export async function actorFromUserId(userId: string): Promise<Actor> {
    const actorRecord = await db.query.actor.findFirst({
        where: eq(actor.userId, userId),
        with: { permissions: true },
    });
    return {
        kind: "user",
        id: userId,
        actorId: actorRecord?.id,
        isAdmin: actorRecord?.isAdmin ?? false,
        permissions: actorRecord?.permissions ?? [],
    };
}

/** Sync — API key's actor+permissions are already loaded by getApiKeyFromRequest() */
export function actorFromApiKey(key: {
    id: string;
    actor: { id: string; isAdmin: boolean; permissions: Permission[] } | null;
}): Actor {
    return {
        kind: "apiKey",
        id: key.id,
        actorId: key.actor?.id,
        isAdmin: key.actor?.isAdmin ?? false,
        permissions: key.actor?.permissions ?? [],
    };
}

// ─── Admin display ──────────────────────────────────────────────────────────

/** Kept for the admin roles/api-keys UI */
export async function getActorPermissions(actorId: string) {
    return db.query.permission.findMany({
        where: eq(permission.actorId, actorId),
        orderBy: (p, { asc }) => [asc(p.spaceSlug), asc(p.eventTypeSlug)],
    });
}
