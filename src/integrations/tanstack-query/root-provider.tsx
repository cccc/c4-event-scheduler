import {
    defaultShouldDehydrateQuery,
    QueryClient,
} from "@tanstack/react-query";

/**
 * Build the per-request QueryClient. Serialization is handled by TanStack
 * Start (seroval), which preserves `Date` natively, so no SuperJSON
 * transformer is needed. Pending queries are dehydrated too so loader
 * prefetches stream to the client without a flash.
 */
export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // With SSR, keep a small staleTime so we don't refetch immediately
                // on the client after hydration.
                staleTime: 30 * 1000,
            },
            dehydrate: {
                shouldDehydrateQuery: (query) =>
                    defaultShouldDehydrateQuery(query) ||
                    query.state.status === "pending",
            },
        },
    });
}

export function getContext() {
    return { queryClient: createQueryClient() };
}
