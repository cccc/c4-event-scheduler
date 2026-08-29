import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { event, occurrenceOverride } from "@/server/db/schema";
import { requirePermission, withApiAuth } from "@/server/rest-auth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

    await db
        .delete(occurrenceOverride)
        .where(
            and(
                eq(occurrenceOverride.eventId, id),
                eq(occurrenceOverride.occurrenceDate, date),
            ),
        );

    return Response.json({ data: { success: true } });
});

export const Route = createFileRoute(
    "/api/v1/events/$id/occurrences/$date/override",
)({
    server: {
        handlers: {
            DELETE,
        },
    },
});
