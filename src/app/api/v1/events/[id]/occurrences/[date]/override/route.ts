import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { event, occurrenceOverride } from "@/server/db/schema";
import { can } from "@/server/permissions";
import { withApiAuth } from "@/server/rest-auth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

    await db
        .delete(occurrenceOverride)
        .where(
            and(
                eq(occurrenceOverride.eventId, id),
                eq(occurrenceOverride.occurrenceDate, date),
            ),
        );

    return NextResponse.json({ data: { success: true } });
});
