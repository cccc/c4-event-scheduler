import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import { expandRruleInTimezone, formatOccurrenceDate } from "@/lib/rrule-utils";
import { getApiKeyFromRequest } from "@/server/api-key-auth";
import { db } from "@/server/db";
import { event } from "@/server/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
	const { id } = await params;
	const apiKeyRecord = await getApiKeyFromRequest(request);
	const isAuthenticated = apiKeyRecord !== null;
	const tz = env.NEXT_PUBLIC_APP_TIMEZONE;

	const { searchParams } = new URL(request.url);
	const startParam = searchParams.get("start");
	const endParam = searchParams.get("end");

	if (!startParam || !endParam) {
		return NextResponse.json(
			{ error: "start and end query parameters are required" },
			{ status: 400 },
		);
	}

	const rangeStart = new Date(startParam);
	const rangeEnd = new Date(endParam);

	if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
		return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
	}

	const evt = await db.query.event.findFirst({
		where: eq(event.id, id),
		with: {
			space: { columns: { id: true, slug: true, name: true } },
			eventType: true,
			overrides: true,
		},
	});

	if (!evt) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if ((evt.isDraft || evt.eventType?.isInternal) && !isAuthenticated) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const defaultDurationMs = evt.eventType?.defaultDurationMinutes
		? evt.eventType.defaultDurationMinutes * 60_000
		: 0;
	const duration = evt.dtend
		? evt.dtend.getTime() - evt.dtstart.getTime()
		: defaultDurationMs;

	const exdatesSet = new Set(
		evt.exdates ? evt.exdates.split(",").map((d) => d.trim()) : [],
	);

	const occurrences: unknown[] = [];

	if (!evt.rrule) {
		const occDate = formatOccurrenceDate(evt.dtstart, tz);
		const override = evt.overrides.find((o) => o.occurrenceDate === occDate);
		const status = override?.status ?? evt.status;
		const start = override?.dtstart ?? evt.dtstart;

		if (start >= rangeStart && start <= rangeEnd) {
			occurrences.push({
				id: `${evt.id}:${occDate}`,
				eventId: evt.id,
				occurrenceDate: occDate,
				summary: override?.summary ?? evt.summary,
				description: override?.description ?? evt.description,
				url: override?.url ?? evt.url,
				location: override?.location ?? evt.location,
				dtstart: start,
				dtend:
					override?.dtend ??
					evt.dtend ??
					(defaultDurationMs
						? new Date(start.getTime() + defaultDurationMs)
						: null),
				allDay: evt.allDay,
				isOverridden: !!override,
				isDraft: evt.isDraft,
				status,
				notes: override?.notes ?? null,
				isRecurring: false,
			});
		}
	} else {
		try {
			const endDate = evt.recurrenceEndDate
				? new Date(
						Math.min(evt.recurrenceEndDate.getTime(), rangeEnd.getTime()),
					)
				: rangeEnd;

			const allDates = expandRruleInTimezone(
				evt.rrule,
				evt.dtstart,
				rangeStart,
				endDate,
				tz,
			);

			for (const date of allDates) {
				const occDate = formatOccurrenceDate(date, tz);
				if (exdatesSet.has(occDate)) continue;

				const override = evt.overrides.find(
					(o) => o.occurrenceDate === occDate,
				);
				const status = override?.status ?? evt.status;
				const start = override?.dtstart ?? date;
				const end =
					override?.dtend ??
					(duration > 0 ? new Date(date.getTime() + duration) : null);

				if (start < rangeStart || start > rangeEnd) continue;

				occurrences.push({
					id: `${evt.id}:${occDate}`,
					eventId: evt.id,
					occurrenceDate: occDate,
					summary: override?.summary ?? evt.summary,
					description: override?.description ?? evt.description,
					url: override?.url ?? evt.url,
					location: override?.location ?? evt.location,
					dtstart: start,
					dtend: end,
					allDay: evt.allDay,
					isOverridden: !!override,
					isDraft: evt.isDraft,
					status,
					notes: override?.notes ?? null,
					isRecurring: true,
				});
			}
		} catch (e) {
			console.error(`Failed to expand RRULE for event ${evt.id}:`, e);
			return NextResponse.json(
				{ error: "Failed to expand recurrence rule" },
				{ status: 500 },
			);
		}
	}

	return NextResponse.json({ data: occurrences });
}
