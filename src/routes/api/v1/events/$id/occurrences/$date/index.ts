import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { UpsertOverrideSchema as upsertOverrideSchema } from "@/lib/api-v1/schemas";
import { db } from "@/server/db";
import { event, occurrenceOverride } from "@/server/db/schema";
import { requirePermission, withApiAuth } from "@/server/rest-auth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PUT = withApiAuth(async (request, actor, params) => {
    const id = params.id;
    const date = params.date;
    if (!id || !date)
        return Response.json({ error: "Not found" }, { status: 404 });

    if (!DATE_PATTERN.test(date)) {
        return Response.json(
            { error: "date must be in YYYY-MM-DD format" },
            { status: 400 },
        );
    }

    const parentEvent = await db.query.event.findFirst({
        where: eq(event.id, id),
        with: { space: true, eventType: true },
    });
    if (!parentEvent) {
        return Response.json({ error: "Not found" }, { status: 404 });
    }

    const denied = requirePermission(request, actor, "manage:events", {
        spaceSlug: parentEvent.space.slug,
        eventTypeSlug: parentEvent.eventType.slug,
    });
    if (denied) return denied;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = upsertOverrideSchema.safeParse(body);
    if (!parsed.success) {
        return Response.json(
            { error: "Validation error", details: parsed.error.flatten() },
            { status: 422 },
        );
    }

    const overrideData = {
        ...parsed.data,
        dtstart:
            parsed.data.dtstart === undefined
                ? undefined
                : parsed.data.dtstart
                  ? new Date(parsed.data.dtstart)
                  : null,
        dtend:
            parsed.data.dtend === undefined
                ? undefined
                : parsed.data.dtend
                  ? new Date(parsed.data.dtend)
                  : null,
    };

    // Bump parent sequence
    await db
        .update(event)
        .set({
            sequence: parentEvent.sequence + 1,
            updatedAt: new Date(),
            updatedByActorId: actor.actorId ?? null,
        })
        .where(eq(event.id, id));

    // Upsert the override
    const existing = await db.query.occurrenceOverride.findFirst({
        where: and(
            eq(occurrenceOverride.eventId, id),
            eq(occurrenceOverride.occurrenceDate, date),
        ),
    });

    let result: typeof occurrenceOverride.$inferSelect | undefined;
    if (existing) {
        [result] = await db
            .update(occurrenceOverride)
            .set({ ...overrideData, updatedAt: new Date() })
            .where(eq(occurrenceOverride.id, existing.id))
            .returning();
    } else {
        [result] = await db
            .insert(occurrenceOverride)
            .values({ eventId: id, occurrenceDate: date, ...overrideData })
            .returning();
    }

    return Response.json({ data: result });
});

const DELETE = withApiAuth(async (request, actor, params) => {
    const id = params.id;
    const date = params.date;
    if (!id || !date)
        return Response.json({ error: "Not found" }, { status: 404 });

    if (!DATE_PATTERN.test(date)) {
        return Response.json(
            { error: "date must be in YYYY-MM-DD format" },
            { status: 400 },
        );
    }

    const evt = await db.query.event.findFirst({
        where: eq(event.id, id),
        with: { space: true, eventType: true },
    });
    if (!evt) {
        return Response.json({ error: "Not found" }, { status: 404 });
    }

    const denied = requirePermission(request, actor, "manage:events", {
        spaceSlug: evt.space.slug,
        eventTypeSlug: evt.eventType.slug,
    });
    if (denied) return denied;

    if (!evt.rrule) {
        // Single event: delete the whole event
        await db.delete(event).where(eq(event.id, id));
        return Response.json({ data: { success: true, deleted: "event" } });
    }

    // Recurring: add to exdates
    const existingExdates = evt.exdates ?? [];
    const newExdates = existingExdates.includes(date)
        ? existingExdates
        : [...existingExdates, date];

    await db
        .update(event)
        .set({
            exdates: newExdates,
            sequence: evt.sequence + 1,
            updatedAt: new Date(),
            updatedByActorId: actor.actorId ?? null,
        })
        .where(eq(event.id, id));

    // Delete any existing override for this date
    await db
        .delete(occurrenceOverride)
        .where(
            and(
                eq(occurrenceOverride.eventId, id),
                eq(occurrenceOverride.occurrenceDate, date),
            ),
        );

    return Response.json({
        data: { success: true, deleted: "occurrence" },
    });
});

export const Route = createFileRoute("/api/v1/events/$id/occurrences/$date/")({
    server: {
        handlers: {
            PUT,
            DELETE,
        },
    },
});
