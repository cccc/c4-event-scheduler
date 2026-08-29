import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { expandRruleInTimezone, formatOccurrenceDate } from "@/lib/rrule-utils";
import { authed, withActor } from "@/server/auth-middleware";
import {
    event,
    eventType,
    occurrenceOverride,
    space,
} from "@/server/db/schema";
import { badRequest, notFound } from "@/server/fn-errors";
import { assertCan } from "@/server/permissions";

// iCal STATUS values (shared by events and occurrence overrides)
const icalStatusSchema = z.enum(["tentative", "confirmed", "cancelled"]);

const listSchema = z.object({
    spaceId: z.uuid().optional(),
    eventTypeId: z.uuid().optional(),
    status: icalStatusSchema.optional(),
});

export const list = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(listSchema)
    .handler(async ({ data, context }) => {
        const conditions = [];

        if (data.spaceId) {
            conditions.push(eq(event.spaceId, data.spaceId));
        }
        if (data.eventTypeId) {
            conditions.push(eq(event.eventTypeId, data.eventTypeId));
        }
        if (data.status) {
            conditions.push(eq(event.status, data.status));
        }

        return context.db.query.event.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: {
                space: true,
                eventType: true,
                overrides: true,
            },
            orderBy: (events, { asc }) => [asc(events.dtstart)],
        });
    });

export const getById = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(z.object({ id: z.uuid() }))
    .handler(async ({ data, context }) => {
        const result = await context.db.query.event.findFirst({
            where: eq(event.id, data.id),
            with: {
                space: true,
                eventType: true,
                createdByActor: {
                    with: {
                        user: { columns: { name: true } },
                        apiKey: { columns: { name: true } },
                    },
                    columns: { kind: true },
                },
                updatedByActor: {
                    with: {
                        user: { columns: { name: true } },
                        apiKey: { columns: { name: true } },
                    },
                    columns: { kind: true },
                },
                overrides: true,
            },
        });

        if (result && !context.session?.user) {
            result.createdByActor = null;
            result.updatedByActor = null;
            result.createdByActorId = null;
            result.updatedByActorId = null;
        }

        return result ?? null;
    });

const getOccurrencesSchema = z.object({
    spaceId: z.uuid().optional(),
    eventTypeId: z.uuid().optional(),
    includeExdates: z.boolean().optional().default(false),
    start: z.date(),
    end: z.date(),
});

// Get expanded occurrences for a date range
// Occurrences are virtual objects with stable IDs: {eventId}:{YYYY-MM-DD}
export const getOccurrences = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(getOccurrencesSchema)
    .handler(async ({ data, context }) => {
        const isLoggedIn = !!context.session?.user;
        const tz = env.APP_TIMEZONE;
        const conditions = [];

        if (data.spaceId) {
            conditions.push(eq(event.spaceId, data.spaceId));
        }
        if (data.eventTypeId) {
            conditions.push(eq(event.eventTypeId, data.eventTypeId));
        }

        // Pre-filter at the DB level: only fetch events whose active range
        // intersects the visible window (like an iCal client would)
        conditions.push(
            or(
                // Single events: dtstart must be within the range
                and(
                    isNull(event.rrule),
                    gte(event.dtstart, data.start),
                    lte(event.dtstart, data.end),
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

        const events = await context.db.query.event.findMany({
            where: and(...conditions),
            with: {
                space: true,
                eventType: true,
                overrides: true,
            },
        });

        // Expand occurrences
        type OccurrenceData = {
            id: string; // Stable ID: {eventId}:{YYYY-MM-DD}
            eventId: string;
            occurrenceDate: string; // YYYY-MM-DD
            summary: string;
            description: string | null;
            url: string | null;
            location: string | null;
            dtstart: Date;
            dtend: Date | null;
            allDay: boolean;
            isOverridden: boolean;
            isDraft: boolean;
            isInternal: boolean;
            status: "tentative" | "confirmed" | "cancelled";
            notes: string | null;
            space: (typeof events)[0]["space"];
            eventType: (typeof events)[0]["eventType"];
            color: string | null;
            isRecurring: boolean;
            rrule: string | null;
        };

        const occurrences: OccurrenceData[] = [];

        for (const evt of events) {
            // Hide draft events from anonymous users
            if (evt.isDraft && !isLoggedIn) continue;

            const isInternal = evt.eventType?.isInternal ?? false;
            const defaultDurationMs = evt.eventType?.defaultDurationMinutes
                ? evt.eventType.defaultDurationMinutes * 60_000
                : 0;
            const duration = evt.dtend
                ? evt.dtend.getTime() - evt.dtstart.getTime()
                : defaultDurationMs;

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

                // Check if within date range
                const start = override?.dtstart ?? evt.dtstart;
                if (start < data.start || start > data.end) continue;

                occurrences.push({
                    id: `${evt.id}:${occDate}`,
                    eventId: evt.id,
                    occurrenceDate: occDate,
                    summary: override?.summary ?? evt.summary,
                    description: override?.description ?? evt.description,
                    url: override?.url ?? evt.url,
                    location: override?.location ?? evt.location,
                    dtstart: start,
                    dtend:
                        override?.dtend ??
                        evt.dtend ??
                        (defaultDurationMs
                            ? new Date(start.getTime() + defaultDurationMs)
                            : null),
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

                        // Calculate actual start/end times
                        const start = override?.dtstart ?? date;
                        const end =
                            override?.dtend ??
                            (duration > 0
                                ? new Date(date.getTime() + duration)
                                : null);

                        // Check if within requested date range
                        if (start < data.start || start > data.end) continue;

                        occurrences.push({
                            id: `${evt.id}:${occDate}`,
                            eventId: evt.id,
                            occurrenceDate: occDate,
                            summary: override?.summary ?? evt.summary,
                            description:
                                override?.description ?? evt.description,
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
                    console.error(
                        `Failed to parse RRULE for event ${evt.id}:`,
                        e,
                    );
                }
            }
        }

        // Sort by start time
        occurrences.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());

        return occurrences;
    });

const createSchema = z.object({
    spaceId: z.uuid(),
    eventTypeId: z.uuid(),
    summary: z.string().min(1).max(255),
    description: z.string().optional(),
    url: z.url().max(1000).optional(),
    location: z.string().max(500).optional(),
    dtstart: z.date(),
    dtend: z.date().optional(),
    timezone: z.string().default("UTC"),
    allDay: z.boolean().default(false),
    rrule: z.string().optional(),
    recurrenceEndDate: z.date().optional(),
    frequencyLabel: z.string().max(255).optional(),
    status: icalStatusSchema.default("confirmed"),
    isDraft: z.boolean().default(true),
});

export const create = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(createSchema)
    .handler(async ({ data: { timezone: _timezone, ...data }, context }) => {
        const [spaceRec, etRec] = await Promise.all([
            context.db.query.space.findFirst({
                where: eq(space.id, data.spaceId),
            }),
            context.db.query.eventType.findFirst({
                where: eq(eventType.id, data.eventTypeId),
            }),
        ]);
        if (!spaceRec) throw notFound("Space not found");
        if (!etRec) throw notFound("Event type not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: spaceRec.slug,
            eventTypeSlug: etRec.slug,
        });

        const [result] = await context.db
            .insert(event)
            .values({
                ...data,
                timezone: env.APP_TIMEZONE,
                createdByActorId: context.actor.actorId ?? null,
            })
            .returning();
        return result ?? null;
    });

const updateSchema = z.object({
    id: z.uuid(),
    eventTypeId: z.uuid().optional(),
    summary: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    url: z.url().max(1000).optional(),
    location: z.string().max(500).optional().nullable(),
    dtstart: z.date().optional(),
    dtend: z.date().optional(),
    timezone: z.string().optional(),
    allDay: z.boolean().optional(),
    rrule: z.string().optional().nullable(),
    recurrenceEndDate: z.date().optional().nullable(),
    frequencyLabel: z.string().max(255).optional().nullable(),
    status: icalStatusSchema.optional(),
    isDraft: z.boolean().optional(),
});

export const update = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(updateSchema)
    .handler(async ({ data, context }) => {
        const existingEvent = await context.db.query.event.findFirst({
            where: eq(event.id, data.id),
            with: { space: true, eventType: true },
        });
        if (!existingEvent) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: existingEvent.space.slug,
            eventTypeSlug: existingEvent.eventType.slug,
        });

        const { id, rrule, ...updates } = data;
        const [result] = await context.db
            .update(event)
            .set({
                ...updates,
                rrule: rrule ?? undefined,
                sequence: existingEvent.sequence + 1,
                updatedAt: new Date(),
                updatedByActorId: context.actor.actorId ?? null,
            })
            .where(eq(event.id, id))
            .returning();
        return result ?? null;
    });

// `delete` is a reserved word, hence deleteEvent
export const deleteEvent = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(z.object({ id: z.uuid() }))
    .handler(async ({ data, context }) => {
        const existingEvent = await context.db.query.event.findFirst({
            where: eq(event.id, data.id),
            with: { space: true, eventType: true },
        });
        if (!existingEvent) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: existingEvent.space.slug,
            eventTypeSlug: existingEvent.eventType.slug,
        });

        await context.db.delete(event).where(eq(event.id, data.id));
        return { success: true };
    });

// =========================================================================
// Occurrence Override Management
// =========================================================================

const upsertOverrideSchema = z.object({
    eventId: z.uuid(),
    occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: icalStatusSchema.optional(),
    notes: z.string().optional(),
    summary: z.string().max(255).optional(),
    description: z.string().optional(),
    url: z.url().max(1000).optional(),
    location: z.string().max(500).optional(),
    dtstart: z.date().nullable().optional(),
    dtend: z.date().nullable().optional(),
});

// Set/update an override for a specific occurrence
export const upsertOverride = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(upsertOverrideSchema)
    .handler(async ({ data, context }) => {
        const parentEvent = await context.db.query.event.findFirst({
            where: eq(event.id, data.eventId),
            with: { space: true, eventType: true },
        });
        if (!parentEvent) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: parentEvent.space.slug,
            eventTypeSlug: parentEvent.eventType.slug,
        });

        const { eventId, occurrenceDate, ...overrideData } = data;

        // Bump parent event's sequence for iCal client update detection
        await context.db
            .update(event)
            .set({
                sequence: parentEvent.sequence + 1,
                updatedAt: new Date(),
                updatedByActorId: context.actor.actorId ?? null,
            })
            .where(eq(event.id, eventId));

        // Check if override exists
        const existing = await context.db.query.occurrenceOverride.findFirst({
            where: and(
                eq(occurrenceOverride.eventId, eventId),
                eq(occurrenceOverride.occurrenceDate, occurrenceDate),
            ),
        });

        if (existing) {
            // Update existing
            const [result] = await context.db
                .update(occurrenceOverride)
                .set({
                    ...overrideData,
                    updatedAt: new Date(),
                })
                .where(eq(occurrenceOverride.id, existing.id))
                .returning();
            return result ?? null;
        }

        // Create new
        const [result] = await context.db
            .insert(occurrenceOverride)
            .values({
                eventId,
                occurrenceDate,
                ...overrideData,
            })
            .returning();
        return result ?? null;
    });

const deleteOccurrenceSchema = z.object({
    eventId: z.uuid(),
    occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Delete an occurrence (adds to exdates for recurring, deletes event for single)
export const deleteOccurrence = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(deleteOccurrenceSchema)
    .handler(async ({ data, context }) => {
        const evt = await context.db.query.event.findFirst({
            where: eq(event.id, data.eventId),
            with: { space: true, eventType: true },
        });
        if (!evt) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: evt.space.slug,
            eventTypeSlug: evt.eventType.slug,
        });

        const { eventId, occurrenceDate } = data;

        if (!evt.rrule) {
            // Delete the entire event
            await context.db.delete(event).where(eq(event.id, eventId));
            return { success: true, deleted: "event" };
        }

        // For recurring events, add date to exdates and remove any override
        const existingExdates = evt.exdates ?? [];
        const newExdates = existingExdates.includes(occurrenceDate)
            ? existingExdates
            : [...existingExdates, occurrenceDate];

        await context.db
            .update(event)
            .set({
                exdates: newExdates,
                sequence: evt.sequence + 1,
                updatedAt: new Date(),
                updatedByActorId: context.actor.actorId ?? null,
            })
            .where(eq(event.id, eventId));

        // Delete any existing override for this date
        await context.db
            .delete(occurrenceOverride)
            .where(
                and(
                    eq(occurrenceOverride.eventId, eventId),
                    eq(occurrenceOverride.occurrenceDate, occurrenceDate),
                ),
            );

        return { success: true, deleted: "occurrence" };
    });

const removeExdateSchema = z.object({
    eventId: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Remove a date from exdates (re-include the occurrence)
export const removeExdate = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(removeExdateSchema)
    .handler(async ({ data, context }) => {
        const evt = await context.db.query.event.findFirst({
            where: eq(event.id, data.eventId),
            with: { space: true, eventType: true },
        });
        if (!evt) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: evt.space.slug,
            eventTypeSlug: evt.eventType.slug,
        });

        const remaining = (evt.exdates ?? []).filter((d) => d !== data.date);
        await context.db
            .update(event)
            .set({
                exdates: remaining.length > 0 ? remaining : null,
                sequence: evt.sequence + 1,
                updatedAt: new Date(),
                updatedByActorId: context.actor.actorId ?? null,
            })
            .where(eq(event.id, data.eventId));
        return { success: true };
    });

const removeOverrideSchema = z.object({
    eventId: z.uuid(),
    occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Remove an override (revert to inherited values)
export const removeOverride = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(removeOverrideSchema)
    .handler(async ({ data, context }) => {
        const parentEvent = await context.db.query.event.findFirst({
            where: eq(event.id, data.eventId),
            with: { space: true, eventType: true },
        });
        if (!parentEvent) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: parentEvent.space.slug,
            eventTypeSlug: parentEvent.eventType.slug,
        });

        await context.db
            .delete(occurrenceOverride)
            .where(
                and(
                    eq(occurrenceOverride.eventId, data.eventId),
                    eq(occurrenceOverride.occurrenceDate, data.occurrenceDate),
                ),
            );

        // Bump parent sequence so iCal subscribers see the change
        await context.db
            .update(event)
            .set({
                sequence: parentEvent.sequence + 1,
                updatedAt: new Date(),
                updatedByActorId: context.actor.actorId ?? null,
            })
            .where(eq(event.id, data.eventId));

        return { success: true };
    });

// =========================================================================
// Series Editing (Split Logic)
// =========================================================================

const editSeriesFromDateSchema = z.object({
    eventId: z.uuid(),
    splitDate: z.date(), // Date from which to split
    // New values for future occurrences (null = keep same)
    summary: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    url: z.url().max(1000).optional(),
    location: z.string().max(500).optional(),
    dtstart: z.date().optional(), // New time-of-day (date part ignored for recurring)
    dtend: z.date().optional(),
    status: icalStatusSchema.optional(),
    rrule: z.string().optional(), // New RRULE (if changing recurrence pattern)
});

// Edit a series from a specific point - creates a new series for future occurrences
// The original series gets an end date, new series starts from splitDate
export const editSeriesFromDate = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(editSeriesFromDateSchema)
    .handler(async ({ data, context }) => {
        const evt = await context.db.query.event.findFirst({
            where: eq(event.id, data.eventId),
            with: { overrides: true, space: true, eventType: true },
        });
        if (!evt) throw notFound("Event not found");
        assertCan(context.actor, "manage:events", {
            spaceSlug: evt.space.slug,
            eventTypeSlug: evt.eventType.slug,
        });

        const { eventId, splitDate, ...updates } = data;
        const tz = env.APP_TIMEZONE;

        if (!evt.rrule) {
            throw badRequest("Cannot split a non-recurring event");
        }

        const farFuture = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
        const allDates = expandRruleInTimezone(
            evt.rrule,
            evt.dtstart,
            evt.dtstart,
            farFuture,
            tz,
        );

        // Find the split point index
        const splitIndex = allDates.findIndex((d) => d >= splitDate);

        if (splitIndex === -1) {
            // All occurrences are before split date - no changes needed
            return { result: "no_future_occurrences", originalEvent: evt };
        }

        if (splitIndex === 0) {
            // All occurrences are after split date - just update the existing event
            const [result] = await context.db
                .update(event)
                .set({
                    summary: updates.summary ?? evt.summary,
                    description: updates.description ?? evt.description,
                    url: updates.url ?? evt.url,
                    location: updates.location ?? evt.location,
                    status: updates.status ?? evt.status,
                    sequence: evt.sequence + 1,
                    updatedAt: new Date(),
                    updatedByActorId: context.actor.actorId ?? null,
                })
                .where(eq(event.id, eventId))
                .returning();

            return { result: "updated_existing", originalEvent: result };
        }

        // We have occurrences both before and after the split date
        // 1. Set end date on original series (day before split)
        const lastOldOccurrence = allDates[splitIndex - 1];
        const firstNewOccurrence = allDates[splitIndex];

        if (!lastOldOccurrence || !firstNewOccurrence) {
            throw new Error("Failed to calculate split dates");
        }

        // Split exdates between old and new series
        const splitDateStr = formatOccurrenceDate(splitDate, tz);
        const oldExdates = (evt.exdates ?? []).filter((d) => d < splitDateStr);
        const newExdates = (evt.exdates ?? []).filter((d) => d >= splitDateStr);

        await context.db
            .update(event)
            .set({
                recurrenceEndDate: new Date(
                    lastOldOccurrence.getTime() + 24 * 60 * 60 * 1000,
                ),
                exdates: oldExdates.length > 0 ? oldExdates : null,
                sequence: evt.sequence + 1,
                updatedAt: new Date(),
                updatedByActorId: context.actor.actorId ?? null,
            })
            .where(eq(event.id, eventId));

        // 2. Create new series starting from split date

        // Adjust start time if provided (keep date from first occurrence, use time from input)
        let newDtstart = firstNewOccurrence;
        if (updates.dtstart) {
            newDtstart = new Date(firstNewOccurrence);
            newDtstart.setHours(
                updates.dtstart.getHours(),
                updates.dtstart.getMinutes(),
                updates.dtstart.getSeconds(),
            );
        }

        // Calculate new end time
        let newDtend: Date | null = null;
        if (updates.dtend) {
            newDtend = new Date(firstNewOccurrence);
            newDtend.setHours(
                updates.dtend.getHours(),
                updates.dtend.getMinutes(),
                updates.dtend.getSeconds(),
            );
        } else if (evt.dtend) {
            const duration = evt.dtend.getTime() - evt.dtstart.getTime();
            newDtend = new Date(newDtstart.getTime() + duration);
        }

        const [newEvent] = await context.db
            .insert(event)
            .values({
                spaceId: evt.spaceId,
                eventTypeId: evt.eventTypeId,
                createdByActorId: context.actor.actorId ?? null,
                updatedByActorId: context.actor.actorId ?? null,
                summary: updates.summary ?? evt.summary,
                description: updates.description ?? evt.description,
                url: updates.url ?? evt.url,
                location: updates.location ?? evt.location,
                dtstart: newDtstart,
                dtend: newDtend,
                timezone: evt.timezone,
                allDay: evt.allDay,
                rrule: updates.rrule ?? evt.rrule,
                recurrenceEndDate: evt.recurrenceEndDate,
                exdates: newExdates.length > 0 ? newExdates : null,
                status: updates.status ?? evt.status,
                isDraft: evt.isDraft,
            })
            .returning();

        // 3. Migrate overrides from old series to new series for dates >= splitDate
        const overridesToMigrate = evt.overrides.filter(
            (o) => o.occurrenceDate >= splitDateStr,
        );

        if (overridesToMigrate.length > 0 && newEvent) {
            // Delete old overrides that are being migrated
            await context.db
                .delete(occurrenceOverride)
                .where(
                    and(
                        eq(occurrenceOverride.eventId, eventId),
                        gte(occurrenceOverride.occurrenceDate, splitDateStr),
                    ),
                );

            // Insert them for the new event
            await context.db.insert(occurrenceOverride).values(
                overridesToMigrate.map((o) => ({
                    eventId: newEvent.id,
                    occurrenceDate: o.occurrenceDate,
                    status: o.status,
                    notes: o.notes,
                    summary: o.summary,
                    description: o.description,
                    url: o.url,
                    location: o.location,
                    dtstart: o.dtstart,
                    dtend: o.dtend,
                })),
            );
        }

        return {
            result: "split",
            originalEvent: evt,
            newEvent,
            splitAtDate: splitDateStr,
            migratedOverrides: overridesToMigrate.length,
        };
    });
