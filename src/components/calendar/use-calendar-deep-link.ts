import type { CalendarController } from "@fullcalendar/react";
import { getRouteApi } from "@tanstack/react-router";
import { isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useAppTimezone } from "@/components/timezone-provider";
import {
    formatEventLink,
    linkedOccurrenceId,
    parseEventLink,
} from "@/lib/event-link";

import type { Occurrence } from "./types";

// getRouteApi instead of importing the Route: the route file imports the
// calendar components, so typing the hooks via the Route would be circular
export const spaceRoute = getRouteApi("/_main/spaces/$slug");

/**
 * The day the calendar should show, as midnight in the app timezone (not
 * local midnight: that would be a different instant on the server and on
 * every client, while the calendar works in the app timezone). The linked
 * occurrence's date, else the first of ?month=, else null (today)
 */
export function parseSearchDate(
    search: { event?: string; month?: string },
    tz: string,
): Date | null {
    const date =
        parseEventLink(search.event)?.occurrenceDate ??
        (search.month ? `${search.month}-01` : undefined);
    if (!date) return null;
    const parsed = fromZonedTime(`${date}T00:00:00`, tz);
    return isValid(parsed) ? parsed : null;
}

/** The space route's linked day (see parseSearchDate), memoized per URL */
export function useLinkedDate(): Date | null {
    const tz = useAppTimezone();
    const { event, month } = spaceRoute.useSearch();
    return useMemo(
        () => parseSearchDate({ event, month }, tz),
        [event, month, tz],
    );
}

type DeepLinkArgs = {
    /** The calendar's controller (useCalendarController), for navigation */
    controller: CalendarController;
    /** From useLinkedDate(); also seeds the calendar's initial date */
    linkedDate: Date | null;
    /** The range the calendar currently shows and fetches */
    dateRange: { start: Date; end: Date };
    /** Occurrences of that range, undefined while loading */
    occurrences: Occurrence[] | undefined;
};

/**
 * The details dialog's state is the space route's ?event= (see its search
 * schema): the linked occurrence, once loaded, is the one the dialog shows.
 * Opening an occurrence sets the link, closing removes it. A link the
 * calendar does not show yet (from outside, e.g. to another month) moves
 * the calendar to its date first. A link to a whole event was already
 * resolved to an occurrence by the route loader; if one is left, the event
 * does not exist or is not visible.
 */
export function useCalendarDeepLink({
    controller,
    linkedDate,
    dateRange,
    occurrences,
}: DeepLinkArgs) {
    const search = spaceRoute.useSearch();
    const navigate = spaceRoute.useNavigate();
    const link = parseEventLink(search.event);
    const linkKey = linkedOccurrenceId(link);
    const linkedOccurrence =
        (linkKey && occurrences?.find((o) => o.id === linkKey)) || null;

    // Once per linked date: move there unless the occurrence is loaded
    // already (a clicked occurrence always is, even one whose date lies
    // outside the view, like a multi-day event from the previous month).
    // initialDate covers the first render
    const isLoaded = linkedOccurrence !== null;
    const followedDate = useRef(linkedDate?.getTime() ?? null);
    useEffect(() => {
        const time = linkedDate?.getTime() ?? null;
        if (time === followedDate.current) return;
        followedDate.current = time;
        if (linkedDate && !isLoaded) controller.gotoDate(linkedDate);
    }, [linkedDate, isLoaded, controller]);

    // Links that lead nowhere: the event is unknown or hidden, or it has no
    // occurrence on that date. Judged only once the range containing the
    // date is loaded (occurrences are undefined while a range loads)
    const unresolvedEvent = !!link && !link.occurrenceDate;
    const rangeCoversLink =
        !!linkedDate &&
        linkedDate >= dateRange.start &&
        linkedDate < dateRange.end;
    const missingOccurrence =
        !!linkKey && !!occurrences && rangeCoversLink && !isLoaded;
    useEffect(() => {
        if (!unresolvedEvent && !missingOccurrence) return;
        toast.error(
            unresolvedEvent
                ? "Linked event not found"
                : "Linked event not found on that date",
        );
        navigate({
            search: (prev) => ({ ...prev, event: undefined }),
            replace: true,
        });
    }, [unresolvedEvent, missingOccurrence, navigate]);

    // Both replace the history entry: no history step per dialog.
    // Opening drops ?month= too: it is the no-JS toolbar's and may be stale
    // by now, and once the link is removed it would move the calendar back
    const openOccurrence = useCallback(
        (occ: Occurrence) =>
            navigate({
                search: {
                    event: formatEventLink(occ.eventId, occ.occurrenceDate),
                },
                replace: true,
            }),
        [navigate],
    );
    // Closing is a view transition: the dialog unmounts right away and the
    // browser animates its last frame out (the dialog rules in globals.css).
    // Without support it just closes
    const closeOccurrence = useCallback(
        () =>
            navigate({
                search: (prev) => ({ ...prev, event: undefined }),
                replace: true,
                viewTransition: true,
            }),
        [navigate],
    );

    return { linkedOccurrence, openOccurrence, closeOccurrence };
}
