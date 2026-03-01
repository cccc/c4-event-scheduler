import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { CreateEventSchema as createEventSchema } from "@/lib/api-v1/schemas";
import { db } from "@/server/db";
import { event, eventType, space } from "@/server/db/schema";
import { can } from "@/server/permissions";
import { withApiAuth, withOptionalApiAuth } from "@/server/rest-auth";
import { buildEventInsertValues } from "../_helpers";

async function getEventWithRelations(id: string) {
    return db.query.event.findFirst({
        where: eq(event.id, id),
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
            overrides: true,
        },
    });
}

export const GET = withOptionalApiAuth(async (_request, actor, params) => {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await getEventWithRelations(id);
    if (!result) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Non-public spaces require auth
    if (!result.space) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Draft and internal events require auth
    if ((result.isDraft || result.eventType?.isInternal) && !actor) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = {
        ...result,
        exdates: result.exdates
            ? result.exdates.split(",").map((d) => d.trim())
            : [],
    };

    if (!actor) {
        const {
            createdByActor: _cba,
            updatedByActor: _uba,
            createdByActorId: _cbaid,
            updatedByActorId: _ubaid,
            ...rest
        } = data;
        return NextResponse.json({ data: rest });
    }

    return NextResponse.json({ data });
});

export const PUT = withApiAuth(async (request, actor, params) => {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    // Resolve space and event type for permission check
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

    const values = buildEventInsertValues(input, actor.actorId);

    const existingEvent = await db.query.event.findFirst({
        where: eq(event.id, id),
        columns: { id: true, sequence: true, createdByActorId: true },
    });

    if (existingEvent) {
        // Event exists — full replace, preserve creator, increment sequence
        const [result] = await db
            .update(event)
            .set({
                ...values,
                createdByActorId: existingEvent.createdByActorId,
                sequence: existingEvent.sequence + 1,
                updatedAt: new Date(),
            })
            .where(eq(event.id, id))
            .returning();

        return NextResponse.json({ data: result });
    }

    // Event does not exist — create it with the client-supplied ID
    const [result] = await db
        .insert(event)
        .values({ id, ...values })
        .returning();

    return NextResponse.json({ data: result }, { status: 201 });
});

export const DELETE = withApiAuth(async (_request, actor, params) => {
    const id = params.id;
    if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existingEvent = await db.query.event.findFirst({
        where: eq(event.id, id),
        with: { space: true, eventType: true },
    });
    if (!existingEvent) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
        !can(actor, "manage:events", {
            spaceSlug: existingEvent.space.slug,
            eventTypeSlug: existingEvent.eventType.slug,
        })
    ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(event).where(eq(event.id, id));
    return NextResponse.json({ data: { success: true } });
});
