import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { eventType, space } from "@/server/db/schema";
import { withOptionalApiAuth } from "@/server/rest-auth";

// GET /api/v1/event-types - public, but internal event types are only
// returned to authenticated (API key) callers, matching /api/v1/events.
const GET = withOptionalApiAuth(async (request, actor) => {
    const { searchParams } = new URL(request.url);
    const spaceSlug = searchParams.get("spaceSlug");

    let spaceId: string | undefined;

    if (spaceSlug) {
        const spaceRecord = await db.query.space.findFirst({
            where: eq(space.slug, spaceSlug),
        });
        if (!spaceRecord) {
            return Response.json({ error: "Space not found" }, { status: 404 });
        }
        spaceId = spaceRecord.id;
    }

    const eventTypes = await db.query.eventType.findMany({
        where: and(
            spaceId ? eq(eventType.spaceId, spaceId) : undefined,
            actor ? undefined : eq(eventType.isInternal, false),
        ),
        with: { space: { columns: { id: true, slug: true, name: true } } },
        orderBy: (et, { asc }) => [asc(et.name)],
    });

    return Response.json({ data: eventTypes });
});

export const Route = createFileRoute("/api/v1/event-types")({
    server: {
        handlers: {
            GET,
        },
    },
});
