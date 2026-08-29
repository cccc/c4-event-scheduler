import { queryOptions } from "@tanstack/react-query";

import { list } from "@/server/fns/api-keys";

export const apiKeysKeys = {
    all: ["apiKeys"] as const,
    list: () => [...apiKeysKeys.all, "list"] as const,
};

export const apiKeysQueries = {
    list: () =>
        queryOptions({
            queryKey: apiKeysKeys.list(),
            queryFn: () => list(),
        }),
};
