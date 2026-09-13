import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { SpaceCalendar } from "@/components/space-calendar";
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
    loader: async ({ context, params }) => {
        const space = await context.queryClient.ensureQueryData(
            spacesQueries.getBySlug(params.slug),
        );
        if (!space) throw notFound();
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
