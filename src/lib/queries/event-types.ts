import { queryOptions } from "@tanstack/react-query";

import { getBySlug, getBySpace, list } from "@/server/fns/event-types";

type ListInput = { globalOnly?: boolean; spaceId?: string } | undefined;

export const eventTypesKeys = {
    all: ["eventTypes"] as const,
    list: (input: ListInput) => [...eventTypesKeys.all, "list", input] as const,
    getBySlug: (slug: string) =>
        [...eventTypesKeys.all, "getBySlug", slug] as const,
    getBySpace: (spaceId: string) =>
        [...eventTypesKeys.all, "getBySpace", spaceId] as const,
};

export const eventTypesQueries = {
    list: (input?: ListInput) =>
        queryOptions({
            queryKey: eventTypesKeys.list(input),
            queryFn: () => list({ data: input }),
        }),
    getBySlug: (slug: string) =>
        queryOptions({
            queryKey: eventTypesKeys.getBySlug(slug),
            queryFn: () => getBySlug({ data: { slug } }),
        }),
    getBySpace: (spaceId: string) =>
        queryOptions({
            queryKey: eventTypesKeys.getBySpace(spaceId),
            queryFn: () => getBySpace({ data: { spaceId } }),
        }),
};
