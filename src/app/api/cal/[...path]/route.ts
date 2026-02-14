import { and, eq, inArray } from "drizzle-orm";
import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { NextRequest } from "next/server";
import { RRule } from "rrule";

import { env } from "@/env";
import { db } from "@/server/db";
import { event, eventType, space } from "@/server/db/schema";

// ============================================================================
// Helpers
// ============================================================================

function formatICalDateUTC(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

function formatICalDateOnly(date: Date): string {
	return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Reconstruct the original start datetime for an occurrence from its date string
 * and the event's start time (preserving the time-of-day from the master event).
 */
function buildRecurrenceIdDate(
	eventStartTime: Date,
	occurrenceDate: string,
): Date {
	const parts = occurrenceDate.split("-").map(Number);
	const d = new Date(eventStartTime);
	d.setUTCFullYear(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
	return d;
}

/**
 * ICalRRuleStub implementation that includes EXDATE lines in toString() output.
 * ical-generator calls toString() and strips DTSTART: lines, preserving all others.
 * This lets us emit both RRULE and EXDATE in a single repeating property.
 */
class RRuleWithExdate {
	private rule: RRule;
	private exdates: Date[];
	private allDay: boolean;

	constructor(
		rruleStr: string,
		dtstart: Date,
		recurrenceEndDate: Date | null,
		exdates: Date[],
		allDay: boolean,
	) {
		const base = RRule.fromString(rruleStr);
		const opts = { ...base.origOptions, dtstart };
		if (
			recurrenceEndDate &&
			!base.origOptions.until &&
			!base.origOptions.count
		) {
			opts.until = recurrenceEndDate;
		}
		this.rule = new RRule(opts);
		this.exdates = exdates;
		this.allDay = allDay;
	}

	between(after: Date, before: Date, inc?: boolean): Date[] {
		return this.rule.between(after, before, inc);
	}

	toString(): string {
		let result = this.rule.toString();
		if (this.exdates.length > 0) {
			const dates = this.exdates
				.map((d) =>
					this.allDay ? formatICalDateOnly(d) : formatICalDateUTC(d),
				)
				.join(",");
			const prefix = this.allDay ? "EXDATE;VALUE=DATE" : "EXDATE";
			result += `\n${prefix}:${dates}`;
		}
		return result;
	}
}

// Helper to map status to iCal status
function mapStatus(status: string): ICalEventStatus {
	switch (status) {
		case "cancelled":
			return ICalEventStatus.CANCELLED;
		case "tentative":
			return ICalEventStatus.TENTATIVE;
		default:
			return ICalEventStatus.CONFIRMED;
	}
}

// ============================================================================
// Route handler
// ============================================================================

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
		spaceSlug = path[0] ?? "";
		eventTypeSlug = slug;
	}

	// Build query conditions
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

	for (const evt of events) {
		// Skip draft and internal events entirely (public feed)
		if (evt.isDraft) continue;
		if (evt.eventType?.isInternal) continue;

		const defaultDurationMs = evt.eventType?.defaultDurationMinutes
			? evt.eventType.defaultDurationMinutes * 60_000
			: 0;
		const duration = evt.dtend
			? evt.dtend.getTime() - evt.dtstart.getTime()
			: defaultDurationMs;

		if (!evt.rrule) {
			// Single event
			const occDate = evt.dtstart.toISOString().slice(0, 10);
			const override = evt.overrides.find((o) => o.occurrenceDate === occDate);
			const status = override?.status ?? evt.status;

			const effectiveStart = override?.dtstart ?? evt.dtstart;
			const effectiveEnd =
				override?.dtend ??
				evt.dtend ??
				(defaultDurationMs
					? new Date(effectiveStart.getTime() + defaultDurationMs)
					: undefined);

			const icalEvent = calendar.createEvent({
				id: evt.id,
				start: effectiveStart,
				end: effectiveEnd,
				allDay: evt.allDay,
				summary: override?.summary ?? evt.summary,
				description: override?.notes
					? `${override.notes}\n\n${override.description ?? evt.description ?? ""}`
					: (override?.description ?? evt.description ?? undefined),
				location: override?.location ?? evt.location ?? evt.space.name,
				url: override?.url ?? evt.url ?? undefined,
				created: evt.createdAt,
				status: mapStatus(status),
				sequence: evt.sequence,
			});
			if (!evt.dtend && defaultDurationMs > 0) {
				icalEvent.x([{ key: "X-OPEN-END", value: "TRUE" }]);
			}
		} else {
			// Recurring event — emit master VEVENT with RRULE + EXDATE,
			// plus override VEVENTs with RECURRENCE-ID
			try {
				// 1. Parse exdates from event column
				const exdates: Date[] = evt.exdates
					? evt.exdates
							.split(",")
							.map((d) => buildRecurrenceIdDate(evt.dtstart, d.trim()))
					: [];

				// 2. Create master VEVENT with RRULE + EXDATE
				const repeating = new RRuleWithExdate(
					evt.rrule,
					evt.dtstart,
					evt.recurrenceEndDate,
					exdates,
					evt.allDay,
				);

				const masterEnd = evt.dtend
					? evt.dtend
					: defaultDurationMs
						? new Date(evt.dtstart.getTime() + defaultDurationMs)
						: undefined;

				const masterEvent = calendar.createEvent({
					id: evt.id,
					start: evt.dtstart,
					end: masterEnd,
					allDay: evt.allDay,
					summary: evt.summary,
					description: evt.description ?? undefined,
					location: evt.location ?? evt.space.name,
					url: evt.url ?? undefined,
					created: evt.createdAt,
					status: mapStatus(evt.status),
					sequence: evt.sequence,
					repeating,
				});
				if (!evt.dtend && defaultDurationMs > 0) {
					masterEvent.x([{ key: "X-OPEN-END", value: "TRUE" }]);
				}

				// 3. Create override VEVENTs with RECURRENCE-ID
				for (const override of evt.overrides) {
					const recurrenceId = buildRecurrenceIdDate(
						evt.dtstart,
						override.occurrenceDate,
					);
					const status = override.status ?? evt.status;
					const start = override.dtstart ?? recurrenceId;
					const end =
						override.dtend ??
						(duration > 0 ? new Date(start.getTime() + duration) : undefined);

					const icalOverride = calendar.createEvent({
						id: evt.id, // Same UID as master
						recurrenceId,
						start,
						end,
						allDay: evt.allDay,
						summary: override.summary ?? evt.summary,
						description: override.notes
							? `${override.notes}\n\n${override.description ?? evt.description ?? ""}`
							: (override.description ?? evt.description ?? undefined),
						location: override.location ?? evt.location ?? evt.space.name,
						url: override.url ?? evt.url ?? undefined,
						created: evt.createdAt,
						status: mapStatus(status),
						sequence: evt.sequence,
					});
					if (!evt.dtend && !override.dtend && defaultDurationMs > 0) {
						icalOverride.x([{ key: "X-OPEN-END", value: "TRUE" }]);
					}
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
