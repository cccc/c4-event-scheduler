import { queryOptions } from "@tanstack/react-query";

import {
    getBySlug,
    getBySpace,
    getDeleteImpact,
    list,
    upcoming,
} from "@/server/fns/event-types";

type UpcomingInput = { months?: number; perType?: number } | undefined;

type ListInput = { globalOnly?: boolean; spaceId?: string } | undefined;

export const eventTypesKeys = {
    all: ["eventTypes"] as const,
    list: (input: ListInput) => [...eventTypesKeys.all, "list", input] as const,
    getBySlug: (slug: string) =>
        [...eventTypesKeys.all, "getBySlug", slug] as const,
    getBySpace: (spaceId: string) =>
        [...eventTypesKeys.all, "getBySpace", spaceId] as const,
    deleteImpact: (id: string) =>
        [...eventTypesKeys.all, "deleteImpact", id] as const,
    upcoming: (input: UpcomingInput) =>
        [...eventTypesKeys.all, "upcoming", input] as const,
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
    deleteImpact: (id: string) =>
        queryOptions({
            queryKey: eventTypesKeys.deleteImpact(id),
            queryFn: () => getDeleteImpact({ data: { id } }),
        }),
    upcoming: (input?: UpcomingInput) =>
        queryOptions({
            queryKey: eventTypesKeys.upcoming(input),
            queryFn: () => upcoming({ data: input }),
        }),
};
