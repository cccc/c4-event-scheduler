import type {
    DatesSetArg,
    EventClickArg,
    EventInput,
    EventMountArg,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import luxon3Plugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { addMonths } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useCallback, useMemo, useRef, useState } from "react";

import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import { effectiveEnd } from "@/components/calendar/date-utils";
import { EditEventDialog } from "@/components/calendar/edit-event-dialog";
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
import { authClient } from "@/server/better-auth/client";

/**
 * The month of `base` plus the following one, in the app timezone, as the
 * initial fetch range (datesSet replaces it with the exact visible range)
 */
function initialRange(base: Date, tz: string): { start: Date; end: Date } {
    const first = fromZonedTime(
        `${formatInTimeZone(base, tz, "yyyy-MM")}-01T00:00:00`,
        tz,
    );
    return { start: first, end: addMonths(first, 2) };
}

function toCalendarEvent(occ: Occurrence): EventInput {
    return {
        id: occ.id,
        title: occ.summary,
        start: occ.dtstart,
        end: effectiveEnd(occ) ?? undefined,
        allDay: occ.allDay,
        classNames: [
            `event-${occ.status}`,
            ...(occ.isDraft ? ["event-draft"] : []),
            ...(occ.isInternal ? ["event-internal"] : []),
        ],
        extendedProps: {
            status: occ.status,
            eventId: occ.eventId,
            description: occ.description,
            url: occ.url,
            color: occ.color,
        },
    };
}

export function SpaceCalendar({ space }: { space: Space }) {
    const tz = useAppTimezone();
    // Absolute URL for the feed, so the subscribe menu can offer a webcal: link
    const { appUrl } = useRouteContext({ from: "__root__" });
    const calendarRef = useRef<FullCalendar>(null);
    const { openCreate, openDetails } = useCalendarDialogStore();

    // Track the visible date range for fetching events; a deep-linked date
    // seeds it so the first fetch already covers that month
    const linkedDate = useLinkedDate();
    const [dateRange, setDateRange] = useState(() =>
        initialRange(linkedDate ?? new Date(), tz),
    );

    const { data: session } = authClient.useSession();

    const { data: eventTypes } = useQuery(eventTypesQueries.list({}));

    // Fetch all occurrences for the visible date range (no status filter = all events)
    const { data: occurrences } = useQuery(
        eventsQueries.getOccurrences({
            spaceId: space.id,
            start: dateRange.start,
            end: dateRange.end,
        }),
    );

    useCalendarDeepLink({ calendarRef, linkedDate, dateRange, occurrences });

    const calendarEvents = useMemo(
        () => occurrences?.map(toCalendarEvent) ?? [],
        [occurrences],
    );

    const isLoggedIn = !!session?.user;

    const handleEventDidMount = useCallback((info: EventMountArg) => {
        const color = info.event.extendedProps.color;
        if (color) {
            info.el.style.setProperty("--event-color", color);
        }
    }, []);

    const handleDatesSet = useCallback((arg: DatesSetArg) => {
        setDateRange({ start: arg.start, end: arg.end });
    }, []);

    const handleDateClick = (info: { date: Date }) => {
        if (!isLoggedIn) return;
        openCreate(info.date);
    };

    const handleEventClick = useCallback(
        (arg: EventClickArg) => {
            const occ = occurrences?.find((o) => o.id === arg.event.id);
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
                        url={`${appUrl}/api/cal/${space.slug}.ics`}
                    />
                    {isLoggedIn && (
                        <Button onClick={() => openCreate()}>
                            Create Event
                        </Button>
                    )}
                </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
                <FullCalendar
                    dateClick={isLoggedIn ? handleDateClick : undefined}
                    datesSet={handleDatesSet}
                    editable={false}
                    eventClick={handleEventClick}
                    eventDidMount={handleEventDidMount}
                    events={calendarEvents}
                    eventTimeFormat={{
                        hour: "2-digit",
                        minute: "2-digit",
                        meridiem: false,
                        hour12: false,
                    }}
                    firstDay={1}
                    headerToolbar={{
                        left: "prev,next today",
                        center: "title",
                        right: "dayGridMonth,timeGridWeek,listMonth",
                    }}
                    height="auto"
                    initialDate={linkedDate ?? undefined}
                    initialView="dayGridMonth"
                    nowIndicator
                    plugins={[
                        luxon3Plugin,
                        dayGridPlugin,
                        timeGridPlugin,
                        listPlugin,
                        interactionPlugin,
                    ]}
                    ref={calendarRef}
                    selectable={isLoggedIn}
                    timeZone={tz}
                />
            </div>

            <CreateEventDialog eventTypes={eventTypes ?? []} space={space} />

            <EventDetailsDialog canEdit={isLoggedIn} />

            <EditEventDialog />
        </>
    );
}
