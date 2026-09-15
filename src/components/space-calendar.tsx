import {
    type DateClickInfo,
    type DatesSetInfo,
    type EventClickInfo,
    type EventInput,
    useCalendarController,
} from "@fullcalendar/react";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { formatInTimeZone } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import {
    effectiveEnd,
    initialCalendarRange,
} from "@/components/calendar/date-utils";
import { EditEventDialog } from "@/components/calendar/edit-event-dialog";
import { EventCalendar } from "@/components/calendar/event-calendar";
import { EventDetailsDialog } from "@/components/calendar/event-details-dialog";
import type { Occurrence, Space } from "@/components/calendar/types";
import {
    useCalendarDeepLink,
    useLinkedDate,
} from "@/components/calendar/use-calendar-deep-link";
import { SubscribeMenu } from "@/components/subscribe-menu";
import { useAppTimezone } from "@/components/timezone-provider";
import { Button } from "@/components/ui/button";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { eventsQueries } from "@/lib/queries/events";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";
import { cn } from "@/lib/utils";

const VIEWS = ["dayGridMonth", "timeGridWeek", "listMonth"];

// Marks the month grid's week rows for the server-render layout rules in
// globals.css (merged over the view options of event-calendar-views.tsx)
const VIEW_OPTIONS = { dayGrid: { dayRowClass: "ssr-day-row" } };

// Status and visibility classes are styled in globals.css (event-* rules)
function toCalendarEvent(occ: Occurrence): EventInput {
    return {
        id: occ.id,
        title: occ.summary,
        start: occ.dtstart,
        end: effectiveEnd(occ) ?? undefined,
        allDay: occ.allDay,
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
    const tz = useAppTimezone();
    // The session comes from the root context so the server render and the
    // hydration render agree; appUrl makes the feed URL absolute (webcal:)
    const { appUrl, session } = useRouteContext({ from: "__root__" });
    const isLoggedIn = !!session?.user;
    const feedUrl = `${appUrl}/api/cal/${space.slug}.ics`;
    const controller = useCalendarController();
    const { openCreate, openDetails } = useCalendarDialogStore();

    // Track the visible date range for fetching events. The initial range
    // (seeded by a deep-linked date) is the one the route loader prefetched,
    // so the first render already has its occurrences
    const linkedDate = useLinkedDate();
    const [dateRange, setDateRange] = useState(() =>
        initialCalendarRange(linkedDate ?? new Date(), tz),
    );

    const { data: eventTypes } = useQuery(eventTypesQueries.list({}));

    // Fetch all occurrences for the visible date range (no status filter = all events)
    const { data: occurrences, isFetching } = useQuery(
        eventsQueries.getOccurrences({
            spaceId: space.id,
            start: dateRange.start,
            end: dateRange.end,
        }),
    );

    useCalendarDeepLink({ controller, linkedDate, dateRange, occurrences });

    const calendarEvents = useMemo(
        () => occurrences?.map(toCalendarEvent) ?? [],
        [occurrences],
    );

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
    }, []);

    const handleDateClick = (info: DateClickInfo) => {
        if (!isLoggedIn) return;
        openCreate(info.date);
    };

    const handleEventClick = useCallback(
        (info: EventClickInfo) => {
            const occ = occurrences?.find((o) => o.id === info.event.id);
            if (occ) {
                openDetails(occ);
            }
        },
        [occurrences, openDetails],
    );

    return (
        <>
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="mb-2 font-bold text-3xl">{space.name}</h1>
                    {space.description && (
                        <p className="text-muted-foreground">
                            {space.description}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <SubscribeMenu
                        access={space.isPublic ? "mixed" : "internal"}
                        url={feedUrl}
                    />
                    {isLoggedIn && (
                        <Button onClick={() => openCreate()}>
                            Create Event
                        </Button>
                    )}
                </div>
            </div>

            {/* The server render shows this month with its events; moving
                around needs JavaScript */}
            <div className="noscript-only">
                <p className="mb-4 rounded-lg border bg-card px-4 py-3 text-muted-foreground text-sm">
                    Browsing other months and event details needs JavaScript.
                    Without it,{" "}
                    <a className="underline" href={feedUrl}>
                        subscribe to the iCal feed
                    </a>{" "}
                    instead.
                </p>
            </div>

            <div className="relative rounded-lg border bg-card p-4">
                {showLoading && (
                    <div
                        aria-live="polite"
                        className="absolute right-4 bottom-4 z-10 rounded-md border bg-card px-3 py-1.5 text-muted-foreground text-sm shadow-md"
                    >
                        Loading events...
                    </div>
                )}
                <div
                    className={cn(
                        "transition-opacity",
                        showLoading && "opacity-60",
                    )}
                >
                    <EventCalendar
                        availableViews={VIEWS}
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
                        // Toolbar title for the server render (the calendar
                        // reports its own once mounted)
                        fallbackTitle={formatInTimeZone(
                            dateRange.start,
                            tz,
                            "MMMM yyyy",
                        )}
                        firstDay={1}
                        height="auto"
                        initialDate={linkedDate ?? undefined}
                        nowIndicator
                        selectable={isLoggedIn}
                        timeZone={tz}
                        views={VIEW_OPTIONS}
                    />
                </div>
            </div>

            <CreateEventDialog eventTypes={eventTypes ?? []} space={space} />

            <EventDetailsDialog canEdit={isLoggedIn} />

            <EditEventDialog />
        </>
    );
}
