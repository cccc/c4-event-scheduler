import { queryOptions } from "@tanstack/react-query";

import { getBySlug, getDeleteImpact, list } from "@/server/fns/spaces";

type ListInput = { includePrivate?: boolean } | undefined;

export const spacesKeys = {
    all: ["spaces"] as const,
    list: (input: ListInput) => [...spacesKeys.all, "list", input] as const,
    getBySlug: (slug: string) =>
        [...spacesKeys.all, "getBySlug", slug] as const,
    deleteImpact: (id: string) =>
        [...spacesKeys.all, "deleteImpact", id] as const,
};

export const spacesQueries = {
    list: (input?: ListInput) =>
        queryOptions({
            queryKey: spacesKeys.list(input),
            queryFn: () => list({ data: input }),
        }),
    getBySlug: (slug: string) =>
        queryOptions({
            queryKey: spacesKeys.getBySlug(slug),
            queryFn: () => getBySlug({ data: { slug } }),
        }),
    deleteImpact: (id: string) =>
        queryOptions({
            queryKey: spacesKeys.deleteImpact(id),
            queryFn: () => getDeleteImpact({ data: { id } }),
        }),
};
