import type { apiKeyPermission } from "@/server/db/schema";

type ApiKeyWithPermissions = {
	isAdmin: boolean;
	permissions: Array<typeof apiKeyPermission.$inferSelect>;
};

type PermissionScope = {
	spaceSlug?: string;
	eventTypeSlug?: string;
};

/**
 * Check if an API key has permission for a given scope.
 * Mirrors the logic in src/server/permissions.ts#hasPermission but uses
 * the API key's embedded permissions instead of querying the DB.
 *
 * Permission hierarchy:
 * - isAdmin=true → full access to everything
 * - Global permission (both slugs null) → access to all spaces/event-types
 * - Space permission (spaceSlug set) → access to that space and all its event types
 * - EventType permission (eventTypeSlug set) → access to that event type in all spaces
 * - Scoped permission (both set) → access only to that event type in that space
 */
export function hasApiKeyPermission(
	key: ApiKeyWithPermissions,
	scope: PermissionScope = {},
): boolean {
	if (key.isAdmin) return true;

	for (const perm of key.permissions) {
		// Global permission (both null)
		if (perm.spaceSlug === null && perm.eventTypeSlug === null) return true;

		if (scope.spaceSlug) {
			// Space-level permission (covers all event types in that space)
			if (perm.spaceSlug === scope.spaceSlug && perm.eventTypeSlug === null)
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
			if (perm.spaceSlug === null && perm.eventTypeSlug === scope.eventTypeSlug)
				return true;
		}
	}

	return false;
}

/**
 * Check if an API key can manage events in a specific space/event-type combination.
 * Mirrors canManageEvents() from src/server/permissions.ts.
 */
export function canApiKeyManageEvents(
	key: ApiKeyWithPermissions,
	spaceSlug: string,
	eventTypeSlug: string,
): boolean {
	return hasApiKeyPermission(key, { spaceSlug, eventTypeSlug });
}
