import { and, eq, ne } from "drizzle-orm";

import { env } from "@/env";
import {
    type Actor,
    type Capabilities,
    can,
    type Permission,
    type PermissionScope,
} from "@/lib/permissions-core";
import { authLog } from "@/server/auth-log";
import { db } from "@/server/db";
import { account, actor, permission } from "@/server/db/schema";
import { forbidden } from "@/server/fn-errors";

export { type Actor, can, type Permission, type PermissionScope };

// ─── Admin resolution ───────────────────────────────────────────────────────

if (env.AUTH_SSO_USERS_ADMIN) {
    authLog.warn(
        "AUTH_SSO_USERS_ADMIN is enabled: every user signed in via the OIDC provider is treated as admin",
    );
}

/**
 * Effective admin flag for a *user* actor: the stored flag, or true when
 * AUTH_SSO_USERS_ADMIN is set and the user signed up through the OIDC
 * provider (has a non-credential account). Local email/password accounts
 * and service API keys always use the stored flag.
 */
export async function resolveUserIsAdmin(
    userId: string,
    stored: boolean | undefined,
): Promise<boolean> {
    if (stored) return true;
    if (!env.AUTH_SSO_USERS_ADMIN) return false;
    const ssoAccount = await db.query.account.findFirst({
        where: and(
            eq(account.userId, userId),
            ne(account.providerId, "credential"),
        ),
        columns: { id: true },
    });
    return !!ssoAccount;
}

/** Compact, log-friendly description of an actor and its permissions */
export function describeActor(actorArg: Actor) {
    const scopes = (perms: Permission[]) =>
        perms.map((p) => `${p.spaceSlug ?? "*"}/${p.eventTypeSlug ?? "*"}`);
    return {
        actorKind: actorArg.kind,
        actorId: actorArg.id,
        isAdmin: actorArg.isAdmin,
        permissions: scopes(actorArg.permissions),
        ownerIsAdmin: actorArg.owner?.isAdmin,
        ownerPermissions: actorArg.owner
            ? scopes(actorArg.owner.permissions)
            : undefined,
    };
}

/** Throws a 403 AppError if not allowed (for use inside server functions) */
export function assertCan(
    actorArg: Actor,
    action: string,
    scope?: PermissionScope,
): void {
    const scopeFields = {
        action,
        spaceSlug: scope?.spaceSlug,
        eventTypeSlug: scope?.eventTypeSlug,
    };
    if (!can(actorArg, action, scope)) {
        authLog.warn("permission denied", {
            ...scopeFields,
            ...describeActor(actorArg),
        });
        throw forbidden();
    }
    authLog.debug("permission granted", {
        ...scopeFields,
        actorKind: actorArg.kind,
        actorId: actorArg.id,
    });
}

// ─── Actor builders ─────────────────────────────────────────────────────────

/** Actor for a signed-in user (session middleware, scripts, key owners) */
export async function actorFromUserId(userId: string): Promise<Actor> {
    const actorRecord = await db.query.actor.findFirst({
        where: eq(actor.userId, userId),
        with: { permissions: true },
    });
    return {
        kind: "user",
        id: userId,
        actorId: actorRecord?.id,
        isAdmin: await resolveUserIsAdmin(userId, actorRecord?.isAdmin),
        permissions: actorRecord?.permissions ?? [],
    };
}

/**
 * Actor for an API key (key + its actor/permissions already loaded by
 * getApiKeyFromRequest). Every key uses its own admin flag and permission
 * rows. A personal key additionally carries its owner's capabilities: the
 * owner must allow the action too, the key's admin flag only counts while
 * the owner is an admin, and audit fields record the owner.
 */
export async function actorFromApiKey(key: {
    id: string;
    userId: string | null;
    actor: { id: string; isAdmin: boolean; permissions: Permission[] } | null;
}): Promise<Actor> {
    const own: Capabilities = {
        isAdmin: key.actor?.isAdmin ?? false,
        permissions: key.actor?.permissions ?? [],
    };
    if (key.userId) {
        const owner = await actorFromUserId(key.userId);
        return {
            kind: "apiKey",
            id: key.id,
            actorId: owner.actorId,
            isAdmin: own.isAdmin && owner.isAdmin,
            permissions: own.permissions,
            owner: { isAdmin: owner.isAdmin, permissions: owner.permissions },
        };
    }
    return {
        kind: "apiKey",
        id: key.id,
        actorId: key.actor?.id,
        ...own,
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
