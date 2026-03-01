import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
    CreateEventSchema as createEventSchema,
    ICalStatusSchema as icalStatusSchema,
} from "@/lib/api-v1/schemas";

import { db } from "@/server/db";
import { event, eventType, space } from "@/server/db/schema";
import { can } from "@/server/permissions";
import { withApiAuth, withOptionalApiAuth } from "@/server/rest-auth";

import { buildEventInsertValues } from "./_helpers";

function stripAuthorFields(evt: Record<string, unknown>) {
    const {
        createdByActor,
        updatedByActor,
        createdByActorId,
        updatedByActorId,
        ...rest
    } = evt as Record<string, unknown> & {
        createdByActor: unknown;
        updatedByActor: unknown;
        createdByActorId: unknown;
        updatedByActorId: unknown;
    };
    return rest;
}

export const GET = withOptionalApiAuth(async (request, actor) => {
    const isAuthenticated = actor !== null;

    const { searchParams } = new URL(request.url);
    const spaceSlug = searchParams.get("spaceSlug");
    const eventTypeSlug = searchParams.get("eventTypeSlug");
    const statusParam = searchParams.get("status");
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const limitParam = searchParams.get("limit");
    const cursorParam = searchParams.get("cursor");

    const limit = Math.min(Number(limitParam) || 50, 100);

    const conditions = [];

    if (spaceSlug) {
        const spaceRecord = await db.query.space.findFirst({
            where: eq(space.slug, spaceSlug),
        });
        if (!spaceRecord) {
            return NextResponse.json(
                { error: "Space not found" },
                { status: 404 },
            );
        }
        conditions.push(eq(event.spaceId, spaceRecord.id));

        // Non-public space requires auth
        if (!spaceRecord.isPublic && !isAuthenticated) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }
    }

    if (eventTypeSlug) {
        const etRecord = await db.query.eventType.findFirst({
            where: eq(eventType.slug, eventTypeSlug),
        });
        if (!etRecord) {
            return NextResponse.json(
                { error: "Event type not found" },
                { status: 404 },
            );
        }
        conditions.push(eq(event.eventTypeId, etRecord.id));
    }

    if (statusParam) {
        const parsed = icalStatusSchema.safeParse(statusParam);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid status value" },
                { status: 400 },
            );
        }
        conditions.push(eq(event.status, parsed.data));
    }

    if (startParam) {
        conditions.push(gte(event.dtstart, new Date(startParam)));
    }
    if (endParam) {
        conditions.push(lte(event.dtstart, new Date(endParam)));
    }

    // Draft visibility: only show drafts to authenticated requests
    if (!isAuthenticated) {
        conditions.push(eq(event.isDraft, false));
    }

    // Keyset pagination
    if (cursorParam) {
        conditions.push(gte(event.dtstart, new Date(cursorParam)));
    }

    const events = await db.query.event.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
            space: { columns: { id: true, slug: true, name: true } },
            eventType: {
                columns: { id: true, slug: true, name: true, isInternal: true },
            },
            createdByActor: {
                columns: { kind: true },
                with: {
                    user: { columns: { name: true } },
                    apiKey: { columns: { name: true } },
                },
            },
            updatedByActor: {
                columns: { kind: true },
                with: {
                    user: { columns: { name: true } },
                    apiKey: { columns: { name: true } },
                },
            },
        },
        orderBy: (e, { asc }) => [asc(e.dtstart)],
        limit: limit + 1,
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;

    const data = items.flatMap((evt) => {
        if (evt.eventType?.isInternal && !isAuthenticated) return [];
        const base = {
            ...evt,
            exdates: evt.exdates
                ? evt.exdates.split(",").map((d) => d.trim())
                : [],
        };
        if (!isAuthenticated) {
            return [
                stripAuthorFields(base as unknown as Record<string, unknown>),
            ];
        }
        return [base];
    });

    const nextCursor = hasMore
        ? items[items.length - 1]?.dtstart.toISOString()
        : undefined;

    return NextResponse.json({
        data,
        total: data.length,
        ...(nextCursor ? { nextCursor } : {}),
    });
});

export const POST = withApiAuth(async (request, actor) => {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Validation error", details: parsed.error.flatten() },
            { status: 422 },
        );
    }

    const input = parsed.data;

    // Look up space and event type for permission check
    const [spaceRecord, eventTypeRecord] = await Promise.all([
        db.query.space.findFirst({ where: eq(space.id, input.spaceId) }),
        db.query.eventType.findFirst({
            where: eq(eventType.id, input.eventTypeId),
        }),
    ]);

    if (!spaceRecord || !eventTypeRecord) {
        return NextResponse.json(
            { error: "Space or event type not found" },
            { status: 404 },
        );
    }

    if (
        !can(actor, "manage:events", {
            spaceSlug: spaceRecord.slug,
            eventTypeSlug: eventTypeRecord.slug,
        })
    ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [result] = await db
        .insert(event)
        .values(buildEventInsertValues(input, actor.actorId))
        .returning();

    return NextResponse.json({ data: result }, { status: 201 });
});
