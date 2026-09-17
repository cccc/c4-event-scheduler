import type { Permission } from "@/lib/permissions-core";

/** One line for a permission row's scope, as shown in key and user lists */
export function formatPermissionScope(perm: Permission): string {
    if (!perm.spaceSlug && !perm.eventTypeSlug) {
        return "Global (all spaces & event types)";
    }
    if (perm.spaceSlug && !perm.eventTypeSlug) {
        return `Space: ${perm.spaceSlug}`;
    }
    if (!perm.spaceSlug && perm.eventTypeSlug) {
        return `Event Type: ${perm.eventTypeSlug} (all spaces)`;
    }
    return `Space: ${perm.spaceSlug} / Event Type: ${perm.eventTypeSlug}`;
}
