import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/server/db";
import { space } from "@/server/db/schema";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const spaceSlug = searchParams.get("spaceSlug");

    let spaceId: string | undefined;

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
        spaceId = spaceRecord.id;
    }

    const resolvedSpaceId = spaceId;
    const eventTypes = await db.query.eventType.findMany({
        where: resolvedSpaceId
            ? (et, { eq: eqFn }) => eqFn(et.spaceId, resolvedSpaceId)
            : undefined,
        with: { space: { columns: { id: true, slug: true, name: true } } },
        orderBy: (et, { asc }) => [asc(et.name)],
    });

    return NextResponse.json({ data: eventTypes });
}
