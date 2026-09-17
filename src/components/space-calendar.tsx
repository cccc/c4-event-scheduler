import {
    type DateClickInfo,
    type DatesSetInfo,
    type EventClickInfo,
    type EventInput,
    useCalendarController,
} from "@fullcalendar/react";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import {
    effectiveEnd,
    initialCalendarRange,
} from "@/components/calendar/date-utils";
import { EditEventDialog } from "@/components/calendar/edit-event-dialog";
import { EventCalendar } from "@/components/calendar/event-calendar";
import type { NavLink } from "@/components/calendar/event-calendar-toolbar";
import { EventDetailsDialog } from "@/components/calendar/event-details-dialog";
import {
    MonthListView,
    MonthView,
    MonthViewContext,
    type MonthViewContextValue,
} from "@/components/calendar/month-view";
import {
    DEFAULT_TIME_WINDOW,
    timeWindowFor,
} from "@/components/calendar/time-window";
import type { Occurrence, Space } from "@/components/calendar/types";
import {
    parseSearchDate,
    useCalendarDeepLink,
    useLinkedDate,
} from "@/components/calendar/use-calendar-deep-link";
import { PageHeader } from "@/components/page-header";
import { SubscribeMenu } from "@/components/subscribe-menu";
import { useAppTimezone } from "@/components/timezone-provider";
import { Button } from "@/components/ui/button";
import { formatEventLink } from "@/lib/event-link";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { eventsQueries } from "@/lib/queries/events";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";
import { cn } from "@/lib/utils";

const VIEWS = ["month", "timeGridWeek", "list"];

// Our own month view (CSS grid, server-renderable): the day grid plugin's
// month definition with our component. A plugin's own view types keep their
// component, so this is a new type on the same base. Week and list views
// are FullCalendar's
const VIEW_OPTIONS = {
    month: {
        type: "dayGrid",
        duration: { months: 1 },
        // Only the weeks the month touches, not always six
        fixedWeekCount: false,
        component: MonthView,
    },
    // The same weeks in the month view's list layout
    list: {
        type: "dayGrid",
        duration: { months: 1 },
        fixedWeekCount: false,
        component: MonthListView,
    },
};
const BUTTONS = {
    month: { text: "Month", hint: "Month view" },
    list: { text: "List", hint: "List view" },
};

/**
 * The query the calendar reads first: the occurrences of the month it opens
 * on (the linked occurrence's or ?month=, else today). The space route's loader ensures
 * it (TanStack's loader + queryOptions pattern), so the server render has
 * the events; the component computes the same range for its initial state.
 */
export function spaceCalendarInitialQuery(opts: {
    timezone: string;
    spaceId: string;
    search: { event?: string; month?: string };
}) {
    const base = parseSearchDate(opts.search, opts.timezone) ?? new Date();
    const range = initialCalendarRange(base, opts.timezone);
    return eventsQueries.getOccurrences({ spaceId: opts.spaceId, ...range });
}

// Status and visibility classes are styled in globals.css (event-* rules)
function toCalendarEvent(occ: Occurrence, href: string): EventInput {
    return {
        id: occ.id,
        title: occ.summary,
        start: occ.dtstart,
        end: effectiveEnd(occ) ?? undefined,
        allDay: occ.allDay,
        // FullCalendar renders events with a url as links: the occurrence's
        // deep link (eventClick keeps plain clicks in the dialog)
        url: href,
        // Sets --fc-event-color on the element; falls back to eventColor
        color: occ.color ?? undefined,
        className: cn(
            `event-${occ.status}`,
            occ.isDraft && "event-draft",
            occ.isInternal && "event-internal",
        ),
        extendedProps: {
            status: occ.status,
            eventId: occ.eventId,
            description: occ.description,
            url: occ.url,
        },
    };
}

export function SpaceCalendar({ space }: { space: Space }) {
    // Not compiled: useCalendarController returns the same object on every
    // render and mutates it, so memoization keyed on it would keep the
    // toolbar (title, month links) on a stale view
    "use no memo";
    const tz = useAppTimezone();
    // The session comes from the root context so the server render and the
    // hydration render agree; appUrl makes the feed URL absolute (webcal:)
    const { appUrl, session } = useRouteContext({ from: "__root__" });
    const isLoggedIn = !!session?.user;
    const feedUrl = `${appUrl}/api/cal/${space.slug}.ics`;
    const controller = useCalendarController();
    const { openCreate, openEdit } = useCalendarDialogStore();
    const router = useRouter();

    // Track the visible date range for fetching events. The initial range
    // (seeded by a deep-linked date) is the one the route loader prefetched,
    // so the first render already has its occurrences
    const linkedDate = useLinkedDate();
    const [dateRange, setDateRange] = useState(() =>
        initialCalendarRange(linkedDate ?? new Date(), tz),
    );
    // The days the current view shows (the fetched range can be larger: the
    // week view extends it by a day when its hours run past midnight)
    const [visibleRange, setVisibleRange] = useState(dateRange);

    const { data: eventTypes } = useQuery(eventTypesQueries.list({}));

    // Fetch all occurrences for the visible date range (no status filter = all events)
    const { data: occurrences, isFetching } = useQuery(
        eventsQueries.getOccurrences({
            spaceId: space.id,
            start: dateRange.start,
            end: dateRange.end,
        }),
    );

    const { linkedOccurrence, openOccurrence, closeOccurrence } =
        useCalendarDeepLink({
            controller,
            linkedDate,
            dateRange,
            occurrences,
        });

    // Deep link of an occurrence (see the route's search schema); the same
    // link the details dialog copies
    const occurrenceHref = useCallback(
        (occ: Occurrence) =>
            router.buildLocation({
                to: "/spaces/$slug",
                params: { slug: space.slug },
                search: {
                    event: formatEventLink(occ.eventId, occ.occurrenceDate),
                },
            }).href,
        [router, space.slug],
    );
    const calendarEvents = useMemo(
        () =>
            occurrences?.map((occ) =>
                toCalendarEvent(occ, occurrenceHref(occ)),
            ) ?? [],
        [occurrences, occurrenceHref],
    );
    const occurrenceById = useMemo(
        () => new Map(occurrences?.map((o) => [o.id, o])),
        [occurrences],
    );
    // The week view shows only the hours its days' events need. Computed from
    // the visible days only and kept while a range loads, so the window and
    // the fetched range cannot feed back into each other
    const [timeWindow, setTimeWindow] = useState(DEFAULT_TIME_WINDOW);
    useEffect(() => {
        if (occurrences) {
            setTimeWindow(timeWindowFor(occurrences, visibleRange, tz));
        }
    }, [occurrences, visibleRange, tz]);

    // Loading state for range fetches, delayed so quick ones do not flicker
    const [showLoading, setShowLoading] = useState(false);
    useEffect(() => {
        if (!isFetching) {
            setShowLoading(false);
            return;
        }
        const timer = setTimeout(() => setShowLoading(true), 300);
        return () => clearTimeout(timer);
    }, [isFetching]);

    const handleDatesSet = useCallback((info: DatesSetInfo) => {
        setDateRange({ start: info.start, end: info.end });
        setVisibleRange({
            start: info.view.currentStart,
            end: info.view.currentEnd,
        });
    }, []);

    const handleDateClick = (info: DateClickInfo) => {
        if (!isLoggedIn) return;
        openCreate(info.date);
    };

    const handleEventClick = useCallback(
        (info: EventClickInfo) => {
            const e = info.jsEvent;
            // Modified clicks follow the event's link (new tab etc.)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            const occ = occurrenceById.get(info.event.id);
            if (occ) {
                openOccurrence(occ);
            }
        },
        [occurrenceById, openOccurrence],
    );

    // Toolbar navigation: real links to ?month= so it works without
    // JavaScript (full page load, server-rendered month); with scripts the
    // click goes to the calendar itself and the URL stays as it is
    const view = controller.view;
    const monthKey = formatInTimeZone(
        view?.currentStart ?? linkedDate ?? new Date(),
        tz,
        "yyyy-MM",
    );
    const monthLink = (month: string | undefined, go: () => void): NavLink => ({
        href: router.buildLocation({
            to: "/spaces/$slug",
            params: { slug: space.slug },
            search: month ? { month } : {},
        }).href,
        onClick: (e) => {
            // plain left clicks only; modified clicks open the link itself
            if (
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
            ) {
                return;
            }
            e.preventDefault();
            go();
        },
    });
    const shiftMonth = (by: number) =>
        addMonths(new Date(`${monthKey}-01T00:00:00Z`), by)
            .toISOString()
            .slice(0, 7);
    const toolbarLinks = {
        today: monthLink(undefined, () => controller.today()),
        prev: monthLink(shiftMonth(-1), () => controller.prev()),
        next: monthLink(shiftMonth(1), () => controller.next()),
    };

    const monthViewContext = useMemo<MonthViewContextValue>(
        () => ({
            tz,
            occurrences: occurrenceById,
            canCreate: isLoggedIn,
            onDayClick: openCreate,
            onEventClick: openOccurrence,
            occurrenceHref,
        }),
        [
            tz,
            occurrenceById,
            isLoggedIn,
            openCreate,
            openOccurrence,
            occurrenceHref,
        ],
    );

    return (
        <>
            <PageHeader
                className="mb-6"
                description={space.description}
                title={space.name}
            >
                <SubscribeMenu
                    access={space.isPublic ? "mixed" : "internal"}
                    url={feedUrl}
                />
                {isLoggedIn && (
                    <Button onClick={() => openCreate()}>Create Event</Button>
                )}
            </PageHeader>

            <EventDetailsDialog
                canEdit={isLoggedIn}
                occurrence={linkedOccurrence}
                onClose={closeOccurrence}
                onEdit={(occ, editTab) => {
                    closeOccurrence();
                    openEdit(occ, editTab);
                }}
            />

            <div className="relative rounded-lg border bg-card p-4">
                {showLoading && (
                    <div
                        aria-live="polite"
                        className="absolute right-4 bottom-4 z-10 rounded-md border bg-card px-3 py-1.5 text-muted-foreground text-sm shadow-md"
                    >
                        Loading events...
                    </div>
                )}
                <MonthViewContext.Provider value={monthViewContext}>
                    <div
                        className={cn(
                            "transition-opacity",
                            showLoading && "opacity-60",
                        )}
                    >
                        <EventCalendar
                            availableViews={VIEWS}
                            buttons={BUTTONS}
                            controller={controller}
                            dateClick={isLoggedIn ? handleDateClick : undefined}
                            datesSet={handleDatesSet}
                            editable={false}
                            eventClick={handleEventClick}
                            // Every event as a bordered block, timed ones included
                            eventDisplay="block"
                            events={calendarEvents}
                            eventTimeFormat={{
                                hour: "2-digit",
                                minute: "2-digit",
                                meridiem: false,
                                hour12: false,
                            }}
                            fallbackTitle={formatInTimeZone(
                                new Date(`${monthKey}-01T00:00:00Z`),
                                "UTC",
                                "MMMM yyyy",
                            )}
                            firstDay={1}
                            height="auto"
                            initialDate={linkedDate ?? undefined}
                            nowIndicator
                            selectable={isLoggedIn}
                            // Overlapping events side by side, not on top of each other
                            slotEventOverlap={false}
                            slotMaxTime={timeWindow.slotMaxTime}
                            slotMinTime={timeWindow.slotMinTime}
                            timeZone={tz}
                            // Toolbar title for the server render (the calendar
                            // reports its own once mounted)
                            toolbarLinks={toolbarLinks}
                            views={VIEW_OPTIONS}
                        />
                    </div>
                </MonthViewContext.Provider>
            </div>

            <CreateEventDialog eventTypes={eventTypes ?? []} space={space} />

            <EditEventDialog />
        </>
    );
}
