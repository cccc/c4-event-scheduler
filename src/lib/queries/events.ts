import { queryOptions } from "@tanstack/react-query";

import { getById, getOccurrences, list } from "@/server/fns/events";

type IcalStatus = "tentative" | "confirmed" | "cancelled";

type ListInput = {
    spaceId?: string;
    eventTypeId?: string;
    status?: IcalStatus;
};

type GetOccurrencesInput = {
    spaceId?: string;
    eventTypeId?: string;
    includeExdates?: boolean;
    start: Date;
    end: Date;
};

export const eventsKeys = {
    all: ["events"] as const,
    list: (input: ListInput) => [...eventsKeys.all, "list", input] as const,
    getById: (id: string) => [...eventsKeys.all, "getById", id] as const,
    getOccurrences: (input: GetOccurrencesInput) =>
        [...eventsKeys.all, "getOccurrences", input] as const,
};

export const eventsQueries = {
    list: (input: ListInput = {}) =>
        queryOptions({
            queryKey: eventsKeys.list(input),
            queryFn: () => list({ data: input }),
        }),
    getById: (id: string) =>
        queryOptions({
            queryKey: eventsKeys.getById(id),
            queryFn: () => getById({ data: { id } }),
        }),
    getOccurrences: (input: GetOccurrencesInput) =>
        queryOptions({
            queryKey: eventsKeys.getOccurrences(input),
            queryFn: () => getOccurrences({ data: input }),
        }),
};
