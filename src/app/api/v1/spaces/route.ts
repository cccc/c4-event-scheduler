import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { can } from "@/server/permissions";
import { withOptionalApiAuth } from "@/server/rest-auth";

export const GET = withOptionalApiAuth(async (_request, actor) => {
    const spaces = await db.query.space.findMany({
        orderBy: (s, { asc }) => [asc(s.name)],
    });

    const filtered = spaces.filter((s) => {
        // Public spaces are always visible
        if (s.isPublic) return true;
        // Private spaces require auth and permission
        if (!actor) return false;
        return can(actor, "view:spaces", { spaceSlug: s.slug });
    });

    return NextResponse.json({ data: filtered });
});
