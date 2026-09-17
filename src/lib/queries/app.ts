import { queryOptions } from "@tanstack/react-query";

import { getAppContext } from "@/server/fns/app";

export const appKeys = {
    all: ["app"] as const,
    context: () => [...appKeys.all, "context"] as const,
};

export const appQueries = {
    /**
     * Session, admin flag and runtime config for the root route, read there
     * with `fetchQuery` (refetches once invalidated, cached otherwise).
     * Resolved once per page load (per request on the server, the query
     * client is created per request) and kept until the session changes:
     * login, logout, account edits and a 401 from any server function
     * invalidate the whole query cache, everything fetched before belonged to
     * the previous session. Nothing observes this query, so without an
     * infinite gcTime it would be collected and refetched on a later
     * navigation.
     */
    context: () =>
        queryOptions({
            queryKey: appKeys.context(),
            queryFn: () => getAppContext(),
            staleTime: Number.POSITIVE_INFINITY,
            gcTime: Number.POSITIVE_INFINITY,
        }),
};
