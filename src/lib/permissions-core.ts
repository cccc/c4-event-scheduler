// Pure permission model shared by server and client (no db/env imports).

export type Permission = {
    spaceSlug: string | null;
    eventTypeSlug: string | null;
};

/** What a subject may do: admin flag plus permission rows */
export type Capabilities = {
    isAdmin: boolean;
    permissions: Permission[];
};

export type Actor = Capabilities & {
    kind: "user" | "apiKey";
    id: string;
    actorId: string | undefined; // actor row UUID for createdByActorId / updatedByActorId
    /**
     * Personal API key: the owner's capabilities. An action must be allowed
     * by the key's own capabilities AND by the owner's.
     */
    owner?: Capabilities;
};

export type PermissionScope = {
    spaceSlug?: string;
    eventTypeSlug?: string;
};

/**
 * Whether a permission list grants a scope.
 *
 * Hierarchy:
 * - Global permission (both slugs null) -> everything
 * - Space permission (spaceSlug set) -> that space and all its event types
 * - EventType permission (eventTypeSlug set) -> that event type in all spaces
 * - Scoped permission (both set) -> only that event type in that space
 */
export function permissionsGrant(
    permissions: Permission[],
    scope: PermissionScope = {},
): boolean {
    for (const perm of permissions) {
        if (perm.spaceSlug === null && perm.eventTypeSlug === null) return true;

        if (scope.spaceSlug) {
            if (
                perm.spaceSlug === scope.spaceSlug &&
                perm.eventTypeSlug === null
            )
                return true;

            if (
                scope.eventTypeSlug &&
                perm.spaceSlug === scope.spaceSlug &&
                perm.eventTypeSlug === scope.eventTypeSlug
            )
                return true;
        }

        if (
            scope.eventTypeSlug &&
            perm.spaceSlug === null &&
            perm.eventTypeSlug === scope.eventTypeSlug
        )
            return true;
    }
    return false;
}

/** Admins pass everything; otherwise a permission row must grant the scope */
export function capabilitiesGrant(
    caps: Capabilities,
    scope: PermissionScope = {},
): boolean {
    return caps.isAdmin || permissionsGrant(caps.permissions, scope);
}

/**
 * Check if an actor may perform an action in a scope: the actor's own
 * capabilities must grant it, and so must its owner's for personal keys.
 * (The action is not yet distinguished; reads are gated by authentication
 * only, permissions gate writes.)
 */
export function can(
    actor: Actor,
    _action: string,
    scope: PermissionScope = {},
): boolean {
    if (!capabilitiesGrant(actor, scope)) return false;
    if (actor.owner && !capabilitiesGrant(actor.owner, scope)) return false;
    return true;
}
