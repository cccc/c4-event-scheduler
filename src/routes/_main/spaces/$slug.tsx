import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";

import {
    SpaceCalendar,
    spaceCalendarInitialQuery,
} from "@/components/space-calendar";
import {
    EVENT_LINK_PATTERN,
    formatEventLink,
    parseEventLink,
} from "@/lib/event-link";
import { eventsQueries } from "@/lib/queries/events";
import { spacesQueries } from "@/lib/queries/spaces";
import { formatOccurrenceDate } from "@/lib/rrule-utils";

// Deep links: ?event=<id>.<YYYY-MM-DD> opens the calendar on that occurrence
// with its details open (lib/event-link.ts); ?event=<id> alone is resolved
// by the loader to the event's first occurrence. ?month=YYYY-MM shows that
// month: the toolbar's links for visitors without JavaScript (scripted
// clients navigate through the calendar and leave the URL alone).
// Malformed values are dropped rather than failing the page
const searchSchema = z.object({
    event: z.string().regex(EVENT_LINK_PATTERN).optional().catch(undefined),
    month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .catch(undefined),
});

export type SpaceSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_main/spaces/$slug")({
    validateSearch: (search: Record<string, unknown>) =>
        searchSchema.parse(search),
    loaderDeps: ({ search }) => ({ event: search.event, month: search.month }),
    loader: async ({ context, params, deps, cause }) => {
        const space = await context.queryClient.ensureQueryData(
            spacesQueries.getBySlug(params.slug),
        );
        if (!space) throw notFound();
        // A link to a whole event opens its first occurrence, in the event's
        // own space. Unknown or hidden events stay as they are: the calendar
        // tells scripted visitors and drops the parameter
        const link = parseEventLink(deps.event);
        if (link && !link.occurrenceDate) {
            const event = await context.queryClient.ensureQueryData(
                eventsQueries.getById(link.eventId),
            );
            if (event) {
                throw redirect({
                    to: "/spaces/$slug",
                    params: { slug: event.space.slug },
                    search: {
                        event: formatEventLink(
                            event.id,
                            formatOccurrenceDate(
                                event.dtstart,
                                context.timezone,
                            ),
                        ),
                    },
                    replace: true,
                });
            }
        }
        // Only for entering the page (the server render, links from other
        // pages): once mounted, the calendar fetches its own ranges, and a
        // search change on the page (closing a linked occurrence's dialog
        // drops ?event=) must not prefetch another range
        if (cause === "stay") return;
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
