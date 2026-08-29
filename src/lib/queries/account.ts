import { queryOptions } from "@tanstack/react-query";

import { getAccountInfo } from "@/server/fns/account";

export const accountKeys = {
    all: ["account"] as const,
    info: () => [...accountKeys.all, "info"] as const,
};

export const accountQueries = {
    info: () =>
        queryOptions({
            queryKey: accountKeys.info(),
            queryFn: () => getAccountInfo(),
        }),
};
