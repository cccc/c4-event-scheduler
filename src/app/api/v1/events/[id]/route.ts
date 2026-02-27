import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { UpdateEventSchema as updateEventSchema } from "@/lib/api-v1/schemas";
import { getApiKeyFromRequest } from "@/server/api-key-auth";
import { canApiKeyManageEvents } from "@/server/api-key-permissions";
import { db } from "@/server/db";
import { event } from "@/server/db/schema";

type Params = { params: Promise<{ id: string }> };

async function getEventWithRelations(id: string) {
	return db.query.event.findFirst({
		where: eq(event.id, id),
		with: {
			space: { columns: { id: true, slug: true, name: true } },
			eventType: {
				columns: { id: true, slug: true, name: true, isInternal: true },
			},
			createdBy: { columns: { name: true } },
			updatedBy: { columns: { name: true } },
			createdByApiKey: { columns: { name: true } },
			updatedByApiKey: { columns: { name: true } },
			overrides: true,
		},
	});
}

export async function GET(request: NextRequest, { params }: Params) {
	const { id } = await params;
	const apiKeyRecord = await getApiKeyFromRequest(request);
	const isAuthenticated = apiKeyRecord !== null;

	const result = await getEventWithRelations(id);
	if (!result) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	// Non-public spaces require auth
	if (!result.space) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	// Draft and internal events require auth
	if ((result.isDraft || result.eventType?.isInternal) && !isAuthenticated) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const data = {
		...result,
		exdates: result.exdates
			? result.exdates.split(",").map((d) => d.trim())
			: [],
	};

	if (!isAuthenticated) {
		const {
			createdBy: _cb,
			updatedBy: _ub,
			createdByApiKey: _cbak,
			updatedByApiKey: _ubak,
			createdById: _cbid,
			updatedById: _ubid,
			createdByApiKeyId: _cbakid,
			updatedByApiKeyId: _ubakid,
			...rest
		} = data;
		return NextResponse.json({ data: rest });
	}

	return NextResponse.json({ data });
}

export async function PUT(request: NextRequest, { params }: Params) {
	const { id } = await params;
	const apiKeyRecord = await getApiKeyFromRequest(request);
	if (!apiKeyRecord) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const existingEvent = await db.query.event.findFirst({
		where: eq(event.id, id),
		with: { space: true, eventType: true },
	});
	if (!existingEvent) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (
		!canApiKeyManageEvents(
			apiKeyRecord,
			existingEvent.space.slug,
			existingEvent.eventType.slug,
		)
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = updateEventSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Validation error", details: parsed.error.flatten() },
			{ status: 422 },
		);
	}

	const input = parsed.data;
	const updates: Record<string, unknown> = {
		...input,
		sequence: existingEvent.sequence + 1,
		updatedAt: new Date(),
		updatedById: null,
		updatedByApiKeyId: apiKeyRecord.id,
	};

	if (input.dtstart) updates.dtstart = new Date(input.dtstart);
	if (input.dtend !== undefined)
		updates.dtend = input.dtend ? new Date(input.dtend) : null;
	if (input.recurrenceEndDate !== undefined) {
		updates.recurrenceEndDate = input.recurrenceEndDate
			? new Date(input.recurrenceEndDate)
			: null;
	}

	const [result] = await db
		.update(event)
		.set(updates)
		.where(eq(event.id, id))
		.returning();

	return NextResponse.json({ data: result });
}

export async function DELETE(request: NextRequest, { params }: Params) {
	const { id } = await params;
	const apiKeyRecord = await getApiKeyFromRequest(request);
	if (!apiKeyRecord) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const existingEvent = await db.query.event.findFirst({
		where: eq(event.id, id),
		with: { space: true, eventType: true },
	});
	if (!existingEvent) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (
		!canApiKeyManageEvents(
			apiKeyRecord,
			existingEvent.space.slug,
			existingEvent.eventType.slug,
		)
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	await db.delete(event).where(eq(event.id, id));
	return NextResponse.json({ data: { success: true } });
}
