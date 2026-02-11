import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/server/db";
import { user, userPermission } from "@/server/db/schema";

export type PermissionScope = {
	spaceSlug?: string;
	eventTypeSlug?: string;
};

/**
 * Check if a user has permission for a given scope
 *
 * Permission hierarchy:
 * - isAdmin=true → full access to everything
 * - Global permission (both slugs null) → access to all spaces/event-types
 * - Space permission (spaceSlug set) → access to that space and all its event types
 * - EventType permission (eventTypeSlug set) → access to that event type in all spaces
 * - Scoped permission (both set) → access only to that event type in that space
 *
 * @param userId - The user ID to check
 * @param scope - The scope to check (spaceSlug and/or eventTypeSlug)
 * @returns true if user has permission, false otherwise
 */
export async function hasPermission(
	userId: string,
	scope: PermissionScope = {},
): Promise<boolean> {
	// Check if user is admin
	const dbUser = await db.query.user.findFirst({
		where: eq(user.id, userId),
	});

	if (dbUser?.isAdmin) {
		return true;
	}

	// Build permission query
	// User has access if any of these match:
	// 1. Global permission (both null)
	// 2. Space matches (and event type is null or matches)
	// 3. Event type matches globally (space null)

	const conditions = [
		// Global permission
		and(isNull(userPermission.spaceSlug), isNull(userPermission.eventTypeSlug)),
	];

	if (scope.spaceSlug) {
		// Space-level permission (covers all event types in space)
		conditions.push(
			and(
				eq(userPermission.spaceSlug, scope.spaceSlug),
				isNull(userPermission.eventTypeSlug),
			),
		);

		if (scope.eventTypeSlug) {
			// Scoped permission (specific event type in specific space)
			conditions.push(
				and(
					eq(userPermission.spaceSlug, scope.spaceSlug),
					eq(userPermission.eventTypeSlug, scope.eventTypeSlug),
				),
			);
		}
	}

	if (scope.eventTypeSlug) {
		// Global event type permission (covers this event type in all spaces)
		conditions.push(
			and(
				isNull(userPermission.spaceSlug),
				eq(userPermission.eventTypeSlug, scope.eventTypeSlug),
			),
		);
	}

	const permission = await db.query.userPermission.findFirst({
		where: and(eq(userPermission.userId, userId), or(...conditions)),
	});

	return permission !== undefined;
}

/**
 * Check if user can manage spaces (create/update/delete)
 * Requires admin or global permission
 */
export async function canManageSpaces(userId: string): Promise<boolean> {
	const dbUser = await db.query.user.findFirst({
		where: eq(user.id, userId),
	});

	if (dbUser?.isAdmin) {
		return true;
	}

	// Check for global permission
	const globalPerm = await db.query.userPermission.findFirst({
		where: and(
			eq(userPermission.userId, userId),
			isNull(userPermission.spaceSlug),
			isNull(userPermission.eventTypeSlug),
		),
	});

	return globalPerm !== undefined;
}

/**
 * Check if user can manage event types (create/update/delete)
 * Requires admin or global permission
 */
export async function canManageEventTypes(userId: string): Promise<boolean> {
	return canManageSpaces(userId); // Same requirement
}

/**
 * Get all permissions for a user (for display in admin UI)
 */
export async function getUserPermissions(userId: string) {
	const dbUser = await db.query.user.findFirst({
		where: eq(user.id, userId),
	});

	const permissions = await db.query.userPermission.findMany({
		where: eq(userPermission.userId, userId),
		orderBy: (p, { asc }) => [asc(p.spaceSlug), asc(p.eventTypeSlug)],
	});

	return {
		isAdmin: dbUser?.isAdmin ?? false,
		permissions,
	};
}

/**
 * Check if user can manage events in a space/event-type combination
 * This is used for event CRUD operations
 */
export async function canManageEvents(
	userId: string,
	spaceSlug: string,
	eventTypeSlug: string,
): Promise<boolean> {
	return hasPermission(userId, { spaceSlug, eventTypeSlug });
}
