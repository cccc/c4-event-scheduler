import { queryOptions } from "@tanstack/react-query";

import { getFeedToken } from "@/server/fns/feed-token";

export const feedTokenKeys = {
    all: ["feedToken"] as const,
    current: () => [...feedTokenKeys.all, "current"] as const,
};

export const feedTokenQueries = {
    current: () =>
        queryOptions({
            queryKey: feedTokenKeys.current(),
            queryFn: () => getFeedToken(),
        }),
};
