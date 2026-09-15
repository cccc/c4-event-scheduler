import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import {
    SpaceCalendar,
    spaceCalendarInitialQuery,
} from "@/components/space-calendar";
import { spacesQueries } from "@/lib/queries/spaces";

// Deep links: ?date=YYYY-MM-DD opens the calendar on that date, ?event=<id>
// additionally opens that event's occurrence on the date (or its first
// occurrence when no date is given). ?month=YYYY-MM shows that month: the
// toolbar's links for visitors without JavaScript (scripted clients navigate
// through the calendar and leave the URL alone)
const searchSchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    event: z.uuid().optional(),
});

export type SpaceSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_main/spaces/$slug")({
    validateSearch: (search: Record<string, unknown>) =>
        searchSchema.parse(search),
    loaderDeps: ({ search }) => ({ date: search.date, month: search.month }),
    loader: async ({ context, params, deps }) => {
        const space = await context.queryClient.ensureQueryData(
            spacesQueries.getBySlug(params.slug),
        );
        if (!space) throw notFound();
        await context.queryClient.ensureQueryData(
            spaceCalendarInitialQuery({
                timezone: context.timezone,
                spaceId: space.id,
                search: deps,
            }),
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
