import type { CalendarController } from "@fullcalendar/react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useAppTimezone } from "@/components/timezone-provider";
import { eventsQueries } from "@/lib/queries/events";
import { formatOccurrenceDate } from "@/lib/rrule-utils";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";

import type { Occurrence } from "./types";

// getRouteApi instead of importing the Route: the route file imports the
// calendar components, so typing the hooks via the Route would be circular
export const spaceRoute = getRouteApi("/_main/spaces/$slug");

/**
 * YYYY-MM-DD from the URL as midnight in the app timezone. Not local
 * midnight: that would be a different instant on the server and on every
 * client, while the calendar displays and reports its ranges in the app
 * timezone.
 */
/**
 * The day the calendar should show, as app-timezone midnight: ?date=, else
 * the first of ?month=, else null (today)
 */
export function parseSearchDate(
    date: string | undefined,
    month: string | undefined,
    tz: string,
): Date | null {
    if (!date && month) date = `${month}-01`;
    if (!date) return null;
    const parsed = fromZonedTime(`${date}T00:00:00`, tz);
    return isValid(parsed) ? parsed : null;
}

/** The ?date= of the space route as a Date, memoized per URL value */
export function useLinkedDate(): Date | null {
    const tz = useAppTimezone();
    const { date, month } = spaceRoute.useSearch();
    return useMemo(() => parseSearchDate(date, month, tz), [date, month, tz]);
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
 * Applies the space route's deep link params (see its search schema):
 * moves the calendar to ?date=, resolves ?event= without a date to the
 * event's first occurrence, and opens the details dialog for the linked
 * occurrence once its range is loaded. Closing the dialog drops ?event=
 * from the URL so a reload stays closed.
 */
export function useCalendarDeepLink({
    controller,
    linkedDate,
    dateRange,
    occurrences,
}: DeepLinkArgs) {
    const tz = useAppTimezone();
    const search = spaceRoute.useSearch();
    const navigate = spaceRoute.useNavigate();
    const { activeDialog, openDetails } = useCalendarDialogStore();

    // Follow ?date= changes after mount (initialDate only applies once)
    useEffect(() => {
        if (linkedDate) {
            controller.gotoDate(linkedDate);
        }
    }, [linkedDate, controller]);

    // ?event= without ?date=: look the event up to find its (first) date
    const { data: linkedEvent } = useQuery({
        ...eventsQueries.getById(search.event ?? ""),
        enabled: !!search.event && !search.date,
    });
    useEffect(() => {
        if (!search.event || search.date || linkedEvent === undefined) return;
        if (linkedEvent === null) {
            toast.error("Linked event not found");
            navigate({ search: {}, replace: true });
            return;
        }
        navigate({
            search: {
                date: formatOccurrenceDate(linkedEvent.dtstart, tz),
                event: search.event,
            },
            replace: true,
        });
    }, [search.event, search.date, linkedEvent, navigate, tz]);

    // ?event= with ?date=: open the occurrence's details once it is loaded.
    // Remembers the handled link so closing the dialog does not reopen it.
    const handledLink = useRef<string | null>(null);
    const linkKey =
        search.event && search.date ? `${search.event}:${search.date}` : null;
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
