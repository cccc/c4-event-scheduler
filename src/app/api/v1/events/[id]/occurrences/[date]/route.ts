import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { UpsertOverrideSchema as upsertOverrideSchema } from "@/lib/api-v1/schemas";
import { db } from "@/server/db";
import { event, occurrenceOverride } from "@/server/db/schema";
import { can } from "@/server/permissions";
import { withApiAuth } from "@/server/rest-auth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PUT = withApiAuth(async (request, actor, params) => {
    const id = params.id;
    const date = params.date;
    if (!id || !date)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!DATE_PATTERN.test(date)) {
        return NextResponse.json(
            { error: "date must be in YYYY-MM-DD format" },
            { status: 400 },
        );
    }

    const parentEvent = await db.query.event.findFirst({
        where: eq(event.id, id),
        with: { space: true, eventType: true },
    });
    if (!parentEvent) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
        !can(actor, "manage:events", {
            spaceSlug: parentEvent.space.slug,
            eventTypeSlug: parentEvent.eventType.slug,
        })
    ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const parsed = upsertOverrideSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Validation error", details: parsed.error.flatten() },
            { status: 422 },
        );
    }

    const overrideData = {
        ...parsed.data,
        dtstart: parsed.data.dtstart
            ? new Date(parsed.data.dtstart)
            : undefined,
        dtend: parsed.data.dtend ? new Date(parsed.data.dtend) : undefined,
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

    return NextResponse.json({ data: result });
});

export const DELETE = withApiAuth(async (_request, actor, params) => {
    const id = params.id;
    const date = params.date;
    if (!id || !date)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!DATE_PATTERN.test(date)) {
        return NextResponse.json(
            { error: "date must be in YYYY-MM-DD format" },
            { status: 400 },
        );
    }

    const evt = await db.query.event.findFirst({
        where: eq(event.id, id),
        with: { space: true, eventType: true },
    });
    if (!evt) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
        !can(actor, "manage:events", {
            spaceSlug: evt.space.slug,
            eventTypeSlug: evt.eventType.slug,
        })
    ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!evt.rrule) {
        // Single event: delete the whole event
        await db.delete(event).where(eq(event.id, id));
        return NextResponse.json({ data: { success: true, deleted: "event" } });
    }

    // Recurring: add to exdates
    const existingExdates = evt.exdates
        ? evt.exdates.split(",").map((d) => d.trim())
        : [];
    if (!existingExdates.includes(date)) {
        existingExdates.push(date);
    }

    await db
        .update(event)
        .set({
            exdates: existingExdates.join(","),
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

    return NextResponse.json({
        data: { success: true, deleted: "occurrence" },
    });
});
