import dottie from "dottie";
import { and, eq } from "drizzle-orm";
import { jwtDecode } from "jwt-decode";

import { env } from "@/env";
import { authLog } from "@/server/auth-log";
import { db } from "@/server/db";
import { account, actor, permission } from "@/server/db/schema";

type ExtractedRoles = {
    roles: string[];
    /** Claim paths that were configured but did not resolve to a string array */
    missingPaths: string[];
    /** Top-level claim names present in the token (for diagnosing OIDC_ROLES_CLAIM) */
    availableClaims: string[];
};

/**
 * Extract role claims from an OIDC token using configurable claim paths
 * Reads from OIDC_ROLES_CLAIM env var (comma-separated dot-notation paths)
 */
function extractClaimsFromToken(idToken: string): ExtractedRoles | null {
    let decoded: Record<string, unknown>;
    try {
        decoded = jwtDecode<Record<string, unknown>>(idToken);
    } catch (error) {
        authLog.error("role sync: failed to decode id token", { error });
        return null;
    }

    const claimPaths = env.OIDC_ROLES_CLAIM.split(",").map((p) => p.trim());
    const claims: string[] = [];
    const missingPaths: string[] = [];

    for (const path of claimPaths) {
        const value = dottie.get(decoded, path);
        if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === "string") {
                    claims.push(item);
                }
            }
        } else {
            missingPaths.push(path);
        }
    }

    // Filter out common internal roles
    const roles = claims.filter(
        (r) =>
            !r.startsWith("default-roles-") &&
            !["offline_access", "uma_authorization"].includes(r),
    );

    return { roles, missingPaths, availableClaims: Object.keys(decoded) };
}

type ParsedPermission = {
    spaceSlug: string | null;
    eventTypeSlug: string | null;
};

/**
 * Parse a claim into a permission
 * Claim formats:
 *   <prefix>:admin              → isAdmin (not returned as permission)
 *   <prefix>:space:<slug>       → { spaceSlug: slug, eventTypeSlug: null }
 *   <prefix>:event-type:<slug>  → { spaceSlug: null, eventTypeSlug: slug }
 *   <prefix>:space:<s>:event-type:<e> → { spaceSlug: s, eventTypeSlug: e }
 */
function parseClaim(
    claim: string,
    prefix: string,
): { isAdmin: true } | { permission: ParsedPermission } | null {
    if (!claim.startsWith(`${prefix}:`)) {
        return null;
    }

    const parts = claim.slice(prefix.length + 1).split(":");

    // <prefix>:admin
    if (parts.length === 1 && parts[0] === "admin") {
        return { isAdmin: true };
    }

    // <prefix>:space:<slug>
    if (parts.length === 2 && parts[0] === "space" && parts[1]) {
        return {
            permission: { spaceSlug: parts[1], eventTypeSlug: null },
        };
    }

    // <prefix>:event-type:<slug>
    if (parts.length === 2 && parts[0] === "event-type" && parts[1]) {
        return {
            permission: { spaceSlug: null, eventTypeSlug: parts[1] },
        };
    }

    // <prefix>:space:<slug>:event-type:<slug>
    if (
        parts.length === 4 &&
        parts[0] === "space" &&
        parts[2] === "event-type" &&
        parts[1] &&
        parts[3]
    ) {
        return {
            permission: { spaceSlug: parts[1], eventTypeSlug: parts[3] },
        };
    }

    return null;
}

const permKey = (p: ParsedPermission) =>
    `${p.spaceSlug ?? "*"}/${p.eventTypeSlug ?? "*"}`;

/**
 * Sync OIDC claims to user permissions via the unified actor/permission tables.
 * - Parses claims with the configured prefix
 * - Sets isAdmin if user has <prefix>:admin claim
 * - Creates/updates permission entries for space/event-type access
 * - Removes OIDC-sourced permissions that no longer apply
 */
export async function syncOidcRoles(userId: string): Promise<void> {
    const prefix = env.OIDC_CLAIM_PREFIX;

    // Get the user's OIDC account
    const oidcAccount = await db.query.account.findFirst({
        where: and(eq(account.userId, userId), eq(account.providerId, "oidc")),
    });

    if (!oidcAccount) {
        // Not an OIDC user (e.g. email/password login); nothing to sync
        authLog.debug("role sync skipped: no oidc account", { userId });
        return;
    }

    if (!oidcAccount.idToken) {
        authLog.warn("role sync skipped: oidc account has no id token", {
            userId,
            accountId: oidcAccount.accountId,
        });
        return;
    }

    // Extract claims from the ID token
    const extracted = extractClaimsFromToken(oidcAccount.idToken);
    if (!extracted) return;

    if (extracted.missingPaths.length > 0) {
        authLog.warn("role sync: roles claim path(s) not found in id token", {
            userId,
            missingPaths: extracted.missingPaths,
            availableClaims: extracted.availableClaims,
        });
    }

    // Parse claims into permissions
    let hasAdminClaim = false;
    const permissions: ParsedPermission[] = [];
    const unrecognized: string[] = [];

    for (const claim of extracted.roles) {
        const parsed = parseClaim(claim, prefix);
        if (!parsed) {
            if (claim.startsWith(`${prefix}:`)) unrecognized.push(claim);
            continue;
        }
        if ("isAdmin" in parsed) {
            hasAdminClaim = true;
        } else {
            permissions.push(parsed.permission);
        }
    }

    authLog.info("role sync: roles from id token", {
        userId,
        prefix,
        roles: extracted.roles,
        isAdmin: hasAdminClaim,
        permissions: permissions.map(permKey),
    });

    if (unrecognized.length > 0) {
        authLog.warn("role sync: ignoring malformed claims with our prefix", {
            userId,
            claims: unrecognized,
        });
    }

    // Find the actor for this user and update isAdmin
    const actorRecord = await db.query.actor.findFirst({
        where: eq(actor.userId, userId),
    });

    if (!actorRecord) {
        authLog.error("role sync: no actor row for user", { userId });
        return;
    }

    if (actorRecord.isAdmin !== hasAdminClaim) {
        authLog.info("role sync: admin flag changed", {
            userId,
            from: actorRecord.isAdmin,
            to: hasAdminClaim,
        });
    }

    await db
        .update(actor)
        .set({ isAdmin: hasAdminClaim })
        .where(eq(actor.userId, userId));

    // Get current OIDC-sourced permissions for this actor
    const currentPermissions = await db.query.permission.findMany({
        where: and(
            eq(permission.actorId, actorRecord.id),
            eq(permission.source, "oidc"),
        ),
    });

    const currentKeys = new Set(currentPermissions.map(permKey));
    const targetKeys = new Set(permissions.map(permKey));

    // Permissions to add
    const toAdd = permissions.filter((p) => !currentKeys.has(permKey(p)));
    if (toAdd.length > 0) {
        await db.insert(permission).values(
            toAdd.map((p) => ({
                actorId: actorRecord.id,
                spaceSlug: p.spaceSlug,
                eventTypeSlug: p.eventTypeSlug,
                source: "oidc" as const,
            })),
        );
    }

    // Permissions to remove
    const toRemove = currentPermissions.filter(
        (p) => !targetKeys.has(permKey(p)),
    );
    for (const p of toRemove) {
        await db.delete(permission).where(eq(permission.id, p.id));
    }

    authLog.info("role sync: done", {
        userId,
        isAdmin: hasAdminClaim,
        permissions: permissions.length,
        added: toAdd.map(permKey),
        removed: toRemove.map(permKey),
    });
}
