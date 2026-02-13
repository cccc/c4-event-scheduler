"use client";

import type {
	DatesSetArg,
	EventClickArg,
	EventInput,
	EventMountArg,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCallback, useMemo, useRef, useState } from "react";

import { CreateEventDialog } from "@/components/calendar/create-event-dialog";
import { EditEventDialog } from "@/components/calendar/edit-event-dialog";
import { EventDetailsDialog } from "@/components/calendar/event-details-dialog";
import type { Space } from "@/components/calendar/types";
import { Button } from "@/components/ui/button";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

export function SpaceCalendar({ space }: { space: Space }) {
	const calendarRef = useRef<FullCalendar>(null);
	const { openCreate, openDetails } = useCalendarDialogStore();

	// Track the visible date range for fetching events
	const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
		return { start, end };
	});

	const { data: session } = authClient.useSession();

	const { data: eventTypes } = api.eventTypes.list.useQuery({});

	// Fetch all occurrences for the visible date range (no status filter = all events)
	const { data: occurrences } = api.events.getOccurrences.useQuery({
		spaceId: space.id,
		start: dateRange.start,
		end: dateRange.end,
	});

	// Convert occurrences to FullCalendar events
	const calendarEvents: EventInput[] = useMemo(() => {
		if (!occurrences) return [];

		return occurrences.map((occ) => ({
			id: occ.id,
			title: occ.title,
			start: occ.start,
			end: occ.end ?? undefined,
			allDay: occ.allDay,
			classNames: [
				`event-${occ.status}`,
				...(occ.isInternal ? ["event-internal"] : []),
			],
			extendedProps: {
				status: occ.status,
				eventId: occ.eventId,
				description: occ.description,
				url: occ.url,
				color: occ.color,
			},
		}));
	}, [occurrences]);

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
						<p className="text-muted-foreground">{space.description}</p>
					)}
					<a
						className="mt-2 inline-block text-muted-foreground text-sm hover:underline"
						href={`/api/cal/${space.slug}.ics`}
					>
						Subscribe (iCal)
					</a>
				</div>
				{isLoggedIn && (
					<Button onClick={() => openCreate()}>Create Event</Button>
				)}
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
					initialView="dayGridMonth"
					nowIndicator
					plugins={[
						dayGridPlugin,
						timeGridPlugin,
						listPlugin,
						interactionPlugin,
					]}
					ref={calendarRef}
					selectable={isLoggedIn}
				/>
			</div>

			<CreateEventDialog eventTypes={eventTypes ?? []} space={space} />

			<EventDetailsDialog canEdit={isLoggedIn} />

			<EditEventDialog />
		</>
	);
}
