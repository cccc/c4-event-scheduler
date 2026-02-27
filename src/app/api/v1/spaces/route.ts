import { type NextRequest, NextResponse } from "next/server";

import { getApiKeyFromRequest } from "@/server/api-key-auth";
import { hasApiKeyPermission } from "@/server/api-key-permissions";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
	const apiKeyRecord = await getApiKeyFromRequest(request);
	const isAuthenticated = apiKeyRecord !== null;

	const spaces = await db.query.space.findMany({
		orderBy: (s, { asc }) => [asc(s.name)],
	});

	const filtered = spaces.filter((s) => {
		// Public spaces are always visible
		if (s.isPublic) return true;
		// Private spaces require auth and permission
		if (!isAuthenticated) return false;
		return hasApiKeyPermission(apiKeyRecord, { spaceSlug: s.slug });
	});

	return NextResponse.json({ data: filtered });
}
