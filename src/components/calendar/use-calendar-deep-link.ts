import type { CalendarController } from "@fullcalendar/react";
import { getRouteApi } from "@tanstack/react-router";
import { isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useAppTimezone } from "@/components/timezone-provider";
import { linkedOccurrenceId, parseEventLink } from "@/lib/event-link";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";

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
 * Applies the space route's deep link params (see its search schema): moves
 * the calendar to the linked occurrence's date and opens its details once
 * its range is loaded. Closing the dialog drops ?event= from the URL so a
 * reload stays closed. A link to a whole event was already resolved to an
 * occurrence by the route loader; if one is left, the event does not exist
 * or is not visible.
 */
export function useCalendarDeepLink({
    controller,
    linkedDate,
    dateRange,
    occurrences,
}: DeepLinkArgs) {
    const search = spaceRoute.useSearch();
    const navigate = spaceRoute.useNavigate();
    const { activeDialog, openDetails } = useCalendarDialogStore();
    const link = parseEventLink(search.event);

    // Follow link changes after mount (initialDate only applies once)
    useEffect(() => {
        if (linkedDate) {
            controller.gotoDate(linkedDate);
        }
    }, [linkedDate, controller]);

    const unresolvedEvent = link && !link.occurrenceDate;
    useEffect(() => {
        if (!unresolvedEvent) return;
        toast.error("Linked event not found");
        navigate({
            search: (prev) => ({ ...prev, event: undefined }),
            replace: true,
        });
    }, [unresolvedEvent, navigate]);

    // Open the occurrence's details once it is loaded. Remembers the handled
    // link so closing the dialog does not reopen it.
    const handledLink = useRef<string | null>(null);
    const linkKey = linkedOccurrenceId(link);
    // Only judge the link against occurrences of the range that contains it
    // (after gotoDate the previous range's data is still around briefly)
    const rangeCoversLink =
        !!linkedDate &&
        linkedDate >= dateRange.start &&
        linkedDate < dateRange.end;
    useEffect(() => {
        if (!linkKey || !occurrences || !rangeCoversLink) return;
        if (handledLink.current === linkKey) {
            if (activeDialog === null) {
                handledLink.current = null;
                navigate({
                    search: (prev) => ({ ...prev, event: undefined }),
                    replace: true,
                });
            }
            return;
        }
        handledLink.current = linkKey;
        const occ = occurrences.find((o) => o.id === linkKey);
        if (occ) {
            openDetails(occ);
        } else {
            toast.error("Linked event not found on that date");
        }
    }, [
        linkKey,
        occurrences,
        rangeCoversLink,
        activeDialog,
        openDetails,
        navigate,
    ]);
}
