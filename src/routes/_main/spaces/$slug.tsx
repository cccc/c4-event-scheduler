import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { initialCalendarRange } from "@/components/calendar/date-utils";
import { parseSearchDate } from "@/components/calendar/use-calendar-deep-link";
import { SpaceCalendar } from "@/components/space-calendar";
import { eventsQueries } from "@/lib/queries/events";
import { spacesQueries } from "@/lib/queries/spaces";

// Deep links: ?date=YYYY-MM-DD opens the calendar on that date, ?event=<id>
// additionally opens that event's occurrence on the date (or its first
// occurrence when no date is given)
const searchSchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    event: z.uuid().optional(),
});

export type SpaceSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_main/spaces/$slug")({
    validateSearch: (search: Record<string, unknown>) =>
        searchSchema.parse(search),
    loaderDeps: ({ search }) => ({ date: search.date }),
    loader: async ({ context, params, deps }) => {
        const space = await context.queryClient.ensureQueryData(
            spacesQueries.getBySlug(params.slug),
        );
        if (!space) throw notFound();
        // Prefetch the occurrences the calendar shows first, so the server
        // render already contains the events (same range as SpaceCalendar)
        const base = parseSearchDate(deps.date, context.timezone) ?? new Date();
        const range = initialCalendarRange(base, context.timezone);
        await context.queryClient.ensureQueryData(
            eventsQueries.getOccurrences({ spaceId: space.id, ...range }),
        );
    },
    component: SpaceDetailPage,
});

function SpaceDetailPage() {
    const { slug } = Route.useParams();
    const { data: space } = useSuspenseQuery(spacesQueries.getBySlug(slug));

    // The loader throws notFound() for null; this just narrows the type.
    if (!space) return null;

    return <SpaceCalendar space={space} />;
}
