import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { env } from "@/env";
import { expandRruleInTimezone, formatOccurrenceDate } from "@/lib/rrule-utils";
import type { db as Db } from "@/server/db";
import { event, type eventType, space } from "@/server/db/schema";

export type OccurrenceQuery = {
    spaceId?: string;
    eventTypeId?: string;
    /** Also emit occurrences on excluded dates (for the exdate editor) */
    includeExdates?: boolean;
    start: Date;
    end: Date;
};

export type Occurrence = {
    id: string; // Stable ID: {eventId}:{YYYY-MM-DD}
    eventId: string;
    occurrenceDate: string; // YYYY-MM-DD
    summary: string;
    description: string | null;
    url: string | null;
    location: string | null;
    dtstart: Date;
    dtend: Date | null; // stored value; null = open end
    allDay: boolean;
    isOverridden: boolean;
    isDraft: boolean;
    isInternal: boolean;
    status: "tentative" | "confirmed" | "cancelled";
    notes: string | null;
    space: typeof space.$inferSelect;
    eventType: typeof eventType.$inferSelect;
    color: string | null;
    isRecurring: boolean;
    rrule: string | null;
};

/**
 * Expand single events and series into concrete occurrences within a date
 * range, applying overrides and the visibility rules for the caller: drafts,
 * internal event types and private spaces are hidden from anonymous
 * visitors. Occurrence IDs are stable: {eventId}:{YYYY-MM-DD}.
 */
export async function expandOccurrences(
    db: typeof Db,
    data: OccurrenceQuery,
    isLoggedIn: boolean,
): Promise<Occurrence[]> {
    const tz = env.APP_TIMEZONE;
    const conditions = [];

    if (data.spaceId) {
        conditions.push(eq(event.spaceId, data.spaceId));
    }
    if (data.eventTypeId) {
        conditions.push(eq(event.eventTypeId, data.eventTypeId));
    }
    if (!isLoggedIn) {
        // Anonymous visitors never see events in private spaces
        const publicSpaces = await db.query.space.findMany({
            where: eq(space.isPublic, true),
            columns: { id: true },
        });
        if (publicSpaces.length === 0) return [];
        conditions.push(
            inArray(
                event.spaceId,
                publicSpaces.map((s) => s.id),
            ),
        );
    }

    // Pre-filter at the DB level: only fetch events whose active range
    // intersects the visible window (like an iCal client would)
    conditions.push(
        or(
            // Single events: the event overlaps the range (a multi-day event
            // that started before the range still shows its remaining days);
            // open-end events count by their start
            and(
                isNull(event.rrule),
                lte(event.dtstart, data.end),
                or(
                    gte(event.dtend, data.start),
                    and(isNull(event.dtend), gte(event.dtstart, data.start)),
                ),
            ),
            // Recurring events: series must overlap the range
            and(
                isNotNull(event.rrule),
                lte(event.dtstart, data.end),
                or(
                    isNull(event.recurrenceEndDate),
                    gte(event.recurrenceEndDate, data.start),
                ),
            ),
        ) as ReturnType<typeof eq>,
    );

    const events = await db.query.event.findMany({
        where: and(...conditions),
        with: {
            space: true,
            eventType: true,
            overrides: true,
        },
    });

    const occurrences: Occurrence[] = [];

    for (const evt of events) {
        // Hide draft events from anonymous users
        if (evt.isDraft && !isLoggedIn) continue;

        const isInternal = evt.eventType?.isInternal ?? false;
        // Duration of the stored end, if any. Open-end events stay open
        // here; the type's default duration is applied at display time.
        const durationMs = evt.dtend
            ? evt.dtend.getTime() - evt.dtstart.getTime()
            : 0;

        // Parse exdates into a Set for fast lookup
        const exdatesSet = new Set(evt.exdates ?? []);

        if (!evt.rrule) {
            // Single event - use the event's start date as occurrence date
            const occDate = formatOccurrenceDate(evt.dtstart, tz);
            const override = evt.overrides.find(
                (o) => o.occurrenceDate === occDate,
            );
            const status = override?.status ?? evt.status;

            // Hide internal events from anonymous users
            if (isInternal && !isLoggedIn) continue;

            // Keep it if it overlaps the range (overrides may have moved it).
            // An inherited end keeps the event's duration from the moved
            // start, so the occurrence cannot end before it begins
            const start = override?.dtstart ?? evt.dtstart;
            const end =
                override?.dtend ??
                (durationMs > 0
                    ? new Date(start.getTime() + durationMs)
                    : null);
            if (start > data.end || (end ?? start) < data.start) continue;

            occurrences.push({
                id: `${evt.id}:${occDate}`,
                eventId: evt.id,
                occurrenceDate: occDate,
                summary: override?.summary ?? evt.summary,
                description: override?.description ?? evt.description,
                url: override?.url ?? evt.url,
                location: override?.location ?? evt.location,
                dtstart: start,
                dtend: end,
                allDay: evt.allDay,
                isOverridden: !!override,
                isDraft: evt.isDraft,
                isInternal,
                status,
                notes: override?.notes ?? null,
                space: evt.space,
                eventType: evt.eventType,
                color: evt.eventType?.color ?? null,
                isRecurring: false,
                rrule: null,
            });
        } else {
            // Recurring event - expand using RRULE with DST-aware timezone handling
            try {
                const endDate = evt.recurrenceEndDate
                    ? new Date(
                          Math.min(
                              evt.recurrenceEndDate.getTime(),
                              data.end.getTime(),
                          ),
                      )
                    : data.end;

                const allDates = expandRruleInTimezone(
                    evt.rrule,
                    evt.dtstart,
                    data.start,
                    endDate,
                    tz,
                );

                // Filter to requested range and create occurrences with date-based ID
                for (const date of allDates) {
                    const occDate = formatOccurrenceDate(date, tz);

                    // Skip exdates unless explicitly requested
                    if (exdatesSet.has(occDate) && !data.includeExdates)
                        continue;

                    // Get override for this date
                    const override = evt.overrides.find(
                        (o) => o.occurrenceDate === occDate,
                    );

                    const status = override?.status ?? evt.status;

                    // Hide internal events from anonymous users
                    if (isInternal && !isLoggedIn) continue;

                    // Actual start/end: an inherited end keeps the series'
                    // duration from the (possibly moved) start
                    const start = override?.dtstart ?? date;
                    const end =
                        override?.dtend ??
                        (durationMs > 0
                            ? new Date(start.getTime() + durationMs)
                            : null);

                    // Keep it if it overlaps the requested range
                    if (start > data.end || (end ?? start) < data.start) {
                        continue;
                    }

                    occurrences.push({
                        id: `${evt.id}:${occDate}`,
                        eventId: evt.id,
                        occurrenceDate: occDate,
                        summary: override?.summary ?? evt.summary,
                        description: override?.description ?? evt.description,
                        url: override?.url ?? evt.url,
                        location: override?.location ?? evt.location,
                        dtstart: start,
                        dtend: end,
                        allDay: evt.allDay,
                        isOverridden: !!override,
                        isDraft: evt.isDraft,
                        isInternal,
                        status,
                        notes: override?.notes ?? null,
                        space: evt.space,
                        eventType: evt.eventType,
                        color: evt.eventType?.color ?? null,
                        isRecurring: true,
                        rrule: evt.rrule,
                    });
                }
            } catch (e) {
                console.error(`Failed to parse RRULE for event ${evt.id}:`, e);
            }
        }
    }

    // Sort by start time
    occurrences.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());

    return occurrences;
}
