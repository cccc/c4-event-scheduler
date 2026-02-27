import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getApiKeyFromRequest } from "@/server/api-key-auth";
import { canApiKeyManageEvents } from "@/server/api-key-permissions";
import { db } from "@/server/db";
import { event, occurrenceOverride } from "@/server/db/schema";

type Params = { params: Promise<{ id: string; date: string }> };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function DELETE(request: NextRequest, { params }: Params) {
	const { id, date } = await params;
	const apiKeyRecord = await getApiKeyFromRequest(request);
	if (!apiKeyRecord) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

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
		!canApiKeyManageEvents(
			apiKeyRecord,
			parentEvent.space.slug,
			parentEvent.eventType.slug,
		)
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
}
