import dottie from "dottie";
import { and, eq } from "drizzle-orm";
import { jwtDecode } from "jwt-decode";

import { env } from "@/env";
import { db } from "@/server/db";
import { account, user, userPermission } from "@/server/db/schema";

/**
 * Extract role claims from an OIDC token using configurable claim paths
 * Reads from OIDC_ROLES_CLAIM env var (comma-separated dot-notation paths)
 */
function extractClaimsFromToken(idToken: string): string[] {
	try {
		const decoded = jwtDecode<Record<string, unknown>>(idToken);
		const claimPaths = env.OIDC_ROLES_CLAIM.split(",").map((p) => p.trim());
		const claims: string[] = [];

		for (const path of claimPaths) {
			const value = dottie.get(decoded, path);
			if (Array.isArray(value)) {
				for (const item of value) {
					if (typeof item === "string") {
						claims.push(item);
					}
				}
			}
		}

		// Filter out common internal roles
		return claims.filter(
			(r) =>
				!r.startsWith("default-roles-") &&
				!["offline_access", "uma_authorization"].includes(r),
		);
	} catch (error) {
		console.error("[Role Sync] Failed to decode ID token:", error);
		return [];
	}
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

/**
 * Sync OIDC claims to user permissions
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

	if (!oidcAccount?.idToken) {
		// Not an OIDC user or no token available
		return;
	}

	// Extract claims from the ID token
	const claims = extractClaimsFromToken(oidcAccount.idToken);

	// Parse claims into permissions
	let hasAdminClaim = false;
	const permissions: ParsedPermission[] = [];

	for (const claim of claims) {
		const parsed = parseClaim(claim, prefix);
		if (parsed) {
			if ("isAdmin" in parsed) {
				hasAdminClaim = true;
			} else {
				permissions.push(parsed.permission);
			}
		}
	}

	// Update isAdmin flag
	await db
		.update(user)
		.set({ isAdmin: hasAdminClaim, updatedAt: new Date() })
		.where(eq(user.id, userId));

	// Get current OIDC-sourced permissions for this user
	const currentPermissions = await db.query.userPermission.findMany({
		where: and(
			eq(userPermission.userId, userId),
			eq(userPermission.source, "oidc"),
		),
	});

	// Build a key for comparison
	const permKey = (p: ParsedPermission) =>
		`${p.spaceSlug ?? ""}:${p.eventTypeSlug ?? ""}`;

	const currentKeys = new Set(
		currentPermissions.map((p) =>
			permKey({ spaceSlug: p.spaceSlug, eventTypeSlug: p.eventTypeSlug }),
		),
	);
	const targetKeys = new Set(permissions.map(permKey));

	// Permissions to add
	const toAdd = permissions.filter((p) => !currentKeys.has(permKey(p)));
	if (toAdd.length > 0) {
		await db.insert(userPermission).values(
			toAdd.map((p) => ({
				userId,
				spaceSlug: p.spaceSlug,
				eventTypeSlug: p.eventTypeSlug,
				source: "oidc" as const,
			})),
		);
	}

	// Permissions to remove
	const toRemove = currentPermissions.filter(
		(p) =>
			!targetKeys.has(
				permKey({ spaceSlug: p.spaceSlug, eventTypeSlug: p.eventTypeSlug }),
			),
	);
	for (const p of toRemove) {
		await db.delete(userPermission).where(eq(userPermission.id, p.id));
	}

	console.log(
		`[Role Sync] User ${userId}: isAdmin=${hasAdminClaim}, permissions=${permissions.length} (added=${toAdd.length}, removed=${toRemove.length})`,
	);
}
