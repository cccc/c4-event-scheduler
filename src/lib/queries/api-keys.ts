import { queryOptions } from "@tanstack/react-query";

import { list, listMine } from "@/server/fns/api-keys";

export const apiKeysKeys = {
    all: ["apiKeys"] as const,
    list: () => [...apiKeysKeys.all, "list"] as const,
    mine: () => [...apiKeysKeys.all, "mine"] as const,
};

export const apiKeysQueries = {
    list: () =>
        queryOptions({
            queryKey: apiKeysKeys.list(),
            queryFn: () => list(),
        }),
    mine: () =>
        queryOptions({
            queryKey: apiKeysKeys.mine(),
            queryFn: () => listMine(),
        }),
};
