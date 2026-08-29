import { queryOptions } from "@tanstack/react-query";

import {
    getUserPermissions,
    listEventTypes,
    listSpaces,
    listUsers,
} from "@/server/fns/users";

export const usersKeys = {
    all: ["users"] as const,
    listUsers: () => [...usersKeys.all, "listUsers"] as const,
    getUserPermissions: (userId: string) =>
        [...usersKeys.all, "getUserPermissions", userId] as const,
    listSpaces: () => [...usersKeys.all, "listSpaces"] as const,
    listEventTypes: () => [...usersKeys.all, "listEventTypes"] as const,
};

export const usersQueries = {
    listUsers: () =>
        queryOptions({
            queryKey: usersKeys.listUsers(),
            queryFn: () => listUsers(),
        }),
    getUserPermissions: (userId: string) =>
        queryOptions({
            queryKey: usersKeys.getUserPermissions(userId),
            queryFn: () => getUserPermissions({ data: { userId } }),
        }),
    listSpaces: () =>
        queryOptions({
            queryKey: usersKeys.listSpaces(),
            queryFn: () => listSpaces(),
        }),
    listEventTypes: () =>
        queryOptions({
            queryKey: usersKeys.listEventTypes(),
            queryFn: () => listEventTypes(),
        }),
};
