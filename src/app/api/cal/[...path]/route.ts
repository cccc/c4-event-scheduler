import { and, eq, inArray } from "drizzle-orm";
import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { NextRequest } from "next/server";
import { RRule } from "rrule";

import { env } from "@/env";
import { db } from "@/server/db";
import { event, eventType, space } from "@/server/db/schema";

// Helper to format a Date as YYYY-MM-DD for occurrence identification
function formatOccurrenceDate(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params;

	// Parse the path: all.ics, {space}.ics, or {space}/{eventType}.ics
	if (!path || path.length === 0) {
		return new Response("Not Found", { status: 404 });
	}

	const filename = path[path.length - 1];
	if (!filename?.endsWith(".ics")) {
		return new Response("Not Found", { status: 404 });
	}

	const slug = filename.replace(".ics", "");
	let spaceSlug: string | null = null;
	let eventTypeSlug: string | null = null;
	let calendarName = "C4 Events";

	if (slug === "all") {
		// All public events
		calendarName = "All Events";
	} else if (path.length === 1) {
		// Space feed: {space}.ics
		spaceSlug = slug;
	} else if (path.length === 2) {
		// Space + event type feed: {space}/{eventType}.ics
		spaceSlug = path[0]!;
		eventTypeSlug = slug;
	}

	// Build query conditions
	// For recurring events, we include all statuses and filter at occurrence level
	// (because individual occurrences may have different statuses via overrides)
	const conditions: ReturnType<typeof eq>[] = [];

	// Track allowed space IDs for filtering
	let allowedSpaceIds: string[] | null = null;

	if (spaceSlug) {
		const spaceRecord = await db.query.space.findFirst({
			where: and(eq(space.slug, spaceSlug), eq(space.isPublic, true)),
		});

		if (!spaceRecord) {
			return new Response("Space not found or not public", { status: 404 });
		}

		conditions.push(eq(event.spaceId, spaceRecord.id));
		calendarName = spaceRecord.name;
	} else {
		// For "all.ics", only include events from public spaces
		const publicSpaces = await db.query.space.findMany({
			where: eq(space.isPublic, true),
		});
		allowedSpaceIds = publicSpaces.map((s) => s.id);
		if (allowedSpaceIds.length === 0) {
			// No public spaces, return empty calendar
			const emptyCalendar = ical({
				name: calendarName,
				prodId: { company: "C4 Events", product: "Event Calendar" },
				method: ICalCalendarMethod.PUBLISH,
				url: env.NEXT_PUBLIC_APP_URL,
			});
			return new Response(emptyCalendar.toString(), {
				headers: {
					"Content-Type": "text/calendar; charset=utf-8",
					"Content-Disposition": `attachment; filename="${slug}.ics"`,
				},
			});
		}
		conditions.push(inArray(event.spaceId, allowedSpaceIds));
	}

	if (eventTypeSlug) {
		const eventTypeRecord = await db.query.eventType.findFirst({
			where: eq(eventType.slug, eventTypeSlug),
		});

		if (!eventTypeRecord) {
			return new Response("Event type not found", { status: 404 });
		}

		conditions.push(eq(event.eventTypeId, eventTypeRecord.id));
		calendarName = `${calendarName} - ${eventTypeRecord.name}`;
	}

	// Fetch events with their overrides
	// We don't filter on status here - we'll filter at occurrence level
	const events = await db.query.event.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		with: {
			space: true,
			eventType: true,
			overrides: true,
		},
	});

	// Generate iCal
	const calendar = ical({
		name: calendarName,
		prodId: { company: "C4 Events", product: "Event Calendar" },
		method: ICalCalendarMethod.PUBLISH,
		url: env.NEXT_PUBLIC_APP_URL,
	});

	// Helper to map status to iCal status
	const mapStatus = (status: string): ICalEventStatus => {
		switch (status) {
			case "cancelled":
				return ICalEventStatus.CANCELLED;
			case "tentative":
				return ICalEventStatus.TENTATIVE;
			default:
				return ICalEventStatus.CONFIRMED;
		}
	};

	// Date range for recurring events
	// Include all past occurrences (from event start) and up to 2 years in the future
	const rangeEnd = new Date();
	rangeEnd.setFullYear(rangeEnd.getFullYear() + 2);

	for (const evt of events) {
		const duration = evt.endTime
			? evt.endTime.getTime() - evt.startTime.getTime()
			: 0;

		if (!evt.isRecurring || !evt.rrule) {
			// Single event - include all regardless of date, filter only by status
			const occDate = formatOccurrenceDate(evt.startTime);
			const override = evt.overrides.find((o) => o.occurrenceDate === occDate);
			const status = override?.status ?? evt.status;
			const isInternal = override?.isInternal ?? evt.isInternal;

			// Skip "gone", "pending", or internal occurrences
			if (status === "gone" || status === "pending" || isInternal) continue;

			calendar.createEvent({
				id: `${evt.id}:${occDate}`,
				start: override?.startTime ?? evt.startTime,
				end: override?.endTime ?? evt.endTime ?? undefined,
				allDay: evt.allDay,
				summary: override?.title ?? evt.title,
				description: override?.notes
					? `${override.notes}\n\n${override.description ?? evt.description ?? ""}`
					: (override?.description ?? evt.description ?? undefined),
				location: override?.location ?? evt.location ?? evt.space.name,
				url: override?.url ?? evt.url ?? undefined,
				created: evt.createdAt,
				status: mapStatus(status),
			});
		} else {
			// Recurring event - expand occurrences and create individual iCal entries
			// Include all past occurrences (from event start) and up to 2 years future
			try {
				// Parse the RRULE and set dtstart from the event's startTime
				const baseRule = RRule.fromString(evt.rrule);
				const rule = new RRule({
					...baseRule.origOptions,
					dtstart: evt.startTime,
				});

				// End date is the earlier of: recurrence end date or 2 years from now
				const endDate = evt.recurrenceEndDate
					? new Date(
							Math.min(evt.recurrenceEndDate.getTime(), rangeEnd.getTime()),
						)
					: rangeEnd;

				// Start from the event's start date (include all past occurrences)
				const allDates = rule.between(evt.startTime, endDate, true);

				for (const date of allDates) {
					const occDate = formatOccurrenceDate(date);

					// Check for override
					const override = evt.overrides.find(
						(o) => o.occurrenceDate === occDate,
					);
					const status = override?.status ?? evt.status;
					const isInternal = override?.isInternal ?? evt.isInternal;

					// Skip "gone", "pending", or internal occurrences
					if (status === "gone" || status === "pending" || isInternal) continue;

					const start = override?.startTime ?? date;
					const end =
						override?.endTime ??
						(evt.endTime ? new Date(date.getTime() + duration) : undefined);

					calendar.createEvent({
						id: `${evt.id}:${occDate}`,
						start,
						end,
						allDay: evt.allDay,
						summary: override?.title ?? evt.title,
						description: override?.notes
							? `${override.notes}\n\n${override.description ?? evt.description ?? ""}`
							: (override?.description ?? evt.description ?? undefined),
						location: override?.location ?? evt.location ?? evt.space.name,
						url: override?.url ?? evt.url ?? undefined,
						created: evt.createdAt,
						status: mapStatus(status),
					});
				}
			} catch (e) {
				console.error(`Failed to parse RRULE for event ${evt.id}:`, e);
			}
		}
	}

	return new Response(calendar.toString(), {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": `attachment; filename="${slug}.ics"`,
		},
	});
}
