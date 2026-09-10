import { useQuery } from "@tanstack/react-query";

import { apiKeysQueries } from "@/lib/queries/api-keys";

import { ADMIN_CAPABILITIES, ApiKeyList } from "./api-key-manager";

/**
 * A user's personal keys on the admin users page, with the full key cards.
 * Reads the admin key list (shared across all users on the page) and
 * filters by owner.
 */
export function UserApiKeys({ userId }: { userId: string }) {
    const { data: keys } = useQuery(apiKeysQueries.list());
    const own = keys?.filter((k) => k.owner?.id === userId) ?? [];
    if (own.length === 0) return null;
    return (
        <div className="mt-4 space-y-2">
            <div className="font-medium text-sm">API keys</div>
            <ApiKeyList
                capabilities={ADMIN_CAPABILITIES}
                emptyText=""
                keys={own}
            />
        </div>
    );
}
