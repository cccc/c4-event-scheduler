import { and, eq, inArray, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { RRule } from "rrule";

import { env } from "@/env";
import { db } from "@/server/db";
import { event, space } from "@/server/db/schema";

type UpcomingEvent = {
	id: string;
	title: string;
	description: string | null;
	url: string | null;
	date: string; // ISO date of next occurrence
	dateLabel: string; // Human-readable date/frequency
	isRecurring: boolean;
	spaceName: string;
	spaceSlug: string;
	eventTypeName: string;
	calendarUrl: string;
	// Cancellation info
	isCancelled: boolean; // Is the immediate next occurrence cancelled?
	cancelledDate: string | null; // Date that was cancelled
	cancelledDateLabel: string | null; // Human-readable cancelled date
	nextAfterCancelled: string | null; // ISO date of next non-cancelled occurrence
	nextAfterCancelledLabel: string | null; // Human-readable date of next after cancelled
};

// Format date in German locale
function formatDate(date: Date, locale = "de-DE"): string {
	return date.toLocaleDateString(locale, {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// Format date as YYYY-MM-DD
function formatOccurrenceDate(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const spaceSlug = searchParams.get("space");
	const limit = Math.min(Number(searchParams.get("limit")) || 10, 50);
	const months = Math.min(
		Math.max(Number(searchParams.get("months")) || 6, 1),
		24,
	);
	const format = searchParams.get("format") || "json";
	const locale = searchParams.get("locale") || "de-DE";

	// Build query conditions
	const conditions: ReturnType<typeof eq>[] = [];
	let allowedSpaceIds: string[] | null = null;

	if (spaceSlug) {
		const spaceRecord = await db.query.space.findFirst({
			where: and(eq(space.slug, spaceSlug), eq(space.isPublic, true)),
		});

		if (!spaceRecord) {
			return new Response("Space not found or not public", { status: 404 });
		}

		conditions.push(eq(event.spaceId, spaceRecord.id));
	} else {
		// Only include events from public spaces
		const publicSpaces = await db.query.space.findMany({
			where: eq(space.isPublic, true),
		});
		allowedSpaceIds = publicSpaces.map((s) => s.id);
		if (allowedSpaceIds.length > 0) {
			conditions.push(inArray(event.spaceId, allowedSpaceIds));
		}
	}

	// Only include confirmed or tentative events that are not internal
	conditions.push(
		or(
			eq(event.status, "confirmed"),
			eq(event.status, "tentative"),
		) as ReturnType<typeof eq>,
	);
	conditions.push(eq(event.isInternal, false));

	const now = new Date();
	const rangeEnd = new Date();
	rangeEnd.setMonth(rangeEnd.getMonth() + months);

	// Fetch events
	const events = await db.query.event.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		with: {
			space: true,
			eventType: true,
			overrides: true,
		},
	});

	// Collect upcoming occurrences
	const upcomingEvents: UpcomingEvent[] = [];

	for (const evt of events) {
		const calendarUrl = `${env.NEXT_PUBLIC_APP_URL}/spaces/${evt.space.slug}`;

		if (!evt.isRecurring || !evt.rrule) {
			// Single event - only include if in the future and within range
			if (evt.startTime >= now && evt.startTime <= rangeEnd) {
				const occDate = formatOccurrenceDate(evt.startTime);
				const override = evt.overrides.find(
					(o) => o.occurrenceDate === occDate,
				);
				const status = override?.status ?? evt.status;
				const isInternal = override?.isInternal ?? evt.isInternal;

				if (status === "gone" || status === "pending" || isInternal) continue;

				const isCancelled = status === "cancelled";

				upcomingEvents.push({
					id: `${evt.id}:${occDate}`,
					title: override?.title ?? evt.title,
					description: override?.description ?? evt.description,
					url: override?.url ?? evt.url,
					date: evt.startTime.toISOString(),
					dateLabel: formatDate(override?.startTime ?? evt.startTime, locale),
					isRecurring: false,
					spaceName: evt.space.name,
					spaceSlug: evt.space.slug,
					eventTypeName: evt.eventType.name,
					calendarUrl,
					isCancelled,
					cancelledDate: null,
					cancelledDateLabel: null,
					nextAfterCancelled: null,
					nextAfterCancelledLabel: null,
				});
			}
		} else {
			// Recurring event - check for cancelled occurrences and find next available
			try {
				const baseRule = RRule.fromString(evt.rrule);
				const rule = new RRule({
					...baseRule.origOptions,
					dtstart: evt.startTime,
				});

				const endDate = evt.recurrenceEndDate
					? new Date(
							Math.min(evt.recurrenceEndDate.getTime(), rangeEnd.getTime()),
						)
					: rangeEnd;

				// Get upcoming occurrences
				const nextDates = rule.between(now, endDate, true);
				if (nextDates.length === 0) continue;

				// Find first non-gone/non-pending occurrence and check if it's cancelled
				let firstValidDate: Date | null = null;
				let firstValidStatus: string | null = null;
				let nextNonCancelledDate: Date | null = null;

				for (const date of nextDates) {
					const occDate = formatOccurrenceDate(date);
					const override = evt.overrides.find(
						(o) => o.occurrenceDate === occDate,
					);
					const status = override?.status ?? evt.status;
					const isInternal = override?.isInternal ?? evt.isInternal;

					// Skip gone, pending, and internal
					if (status === "gone" || status === "pending" || isInternal) continue;

					if (!firstValidDate) {
						firstValidDate = date;
						firstValidStatus = status;
						// If first valid is not cancelled, we're done
						if (status !== "cancelled") {
							nextNonCancelledDate = date;
							break;
						}
					} else if (status !== "cancelled" && !nextNonCancelledDate) {
						// Found next non-cancelled after a cancelled one
						nextNonCancelledDate = date;
						break;
					}
				}

				if (!firstValidDate) continue;

				const isCancelled = firstValidStatus === "cancelled";
				const dateLabel =
					evt.frequencyLabel || formatDate(firstValidDate, locale);

				upcomingEvents.push({
					id: `${evt.id}:recurring`,
					title: evt.title,
					description: evt.description,
					url: evt.url,
					date: (nextNonCancelledDate ?? firstValidDate).toISOString(),
					dateLabel,
					isRecurring: true,
					spaceName: evt.space.name,
					spaceSlug: evt.space.slug,
					eventTypeName: evt.eventType.name,
					calendarUrl,
					isCancelled,
					cancelledDate: isCancelled ? firstValidDate.toISOString() : null,
					cancelledDateLabel: isCancelled
						? formatDate(firstValidDate, locale)
						: null,
					nextAfterCancelled:
						isCancelled && nextNonCancelledDate
							? nextNonCancelledDate.toISOString()
							: null,
					nextAfterCancelledLabel:
						isCancelled && nextNonCancelledDate
							? formatDate(nextNonCancelledDate, locale)
							: null,
				});
			} catch (e) {
				console.error(`Failed to parse RRULE for event ${evt.id}:`, e);
			}
		}
	}

	// Sort by date and limit
	upcomingEvents.sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);
	const limited = upcomingEvents.slice(0, limit);

	// Return in requested format
	if (format === "html") {
		const html = generateHtml(limited, spaceSlug);
		return new Response(html, {
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	return new Response(JSON.stringify({ events: limited }, null, 2), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
		},
	});
}

function generateHtml(
	events: UpcomingEvent[],
	spaceSlug: string | null,
): string {
	const calendarLink = spaceSlug
		? `${env.NEXT_PUBLIC_APP_URL}/spaces/${spaceSlug}`
		: `${env.NEXT_PUBLIC_APP_URL}/spaces`;

	let rows: string;
	if (events.length === 0) {
		rows = `<tr class="event-row"><td colspan="2">Keine kommenden Veranstaltungen</td></tr>`;
	} else {
		rows = events
			.map((evt) => {
				const classes = [
					"event-row",
					evt.isRecurring ? "recurring" : "",
					evt.isCancelled ? "cancelled" : "",
				]
					.filter(Boolean)
					.join(" ");

				let dateCell = escapeHtml(evt.dateLabel);
				if (evt.isCancelled && evt.cancelledDateLabel) {
					dateCell = `<span class="cancelled-date"><s>${escapeHtml(evt.cancelledDateLabel)}</s></span>`;
					if (evt.nextAfterCancelledLabel) {
						dateCell += `<br><span class="next-date">Nächster: ${escapeHtml(evt.nextAfterCancelledLabel)}</span>`;
					}
				}

				const titleCell = evt.url
					? `<a href="${escapeHtml(evt.url)}">${escapeHtml(evt.title)}</a>`
					: escapeHtml(evt.title);

				return `<tr class="${classes}">
  <td>${dateCell}</td>
  <td>${titleCell}${evt.isCancelled ? ' <span class="cancelled-badge">Fällt aus</span>' : ""}</td>
</tr>`;
			})
			.join("\n");
	}

	return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    .upcoming-events { font-family: inherit; }
    .upcoming-events table { width: 100%; border-collapse: collapse; }
    .upcoming-events th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #ddd; }
    .upcoming-events td { padding: 0.5rem; border-bottom: 1px solid #eee; }
    .upcoming-events .event-row a { color: inherit; text-decoration: none; }
    .upcoming-events .event-row a:hover { text-decoration: underline; }
    .upcoming-events .calendar-link { margin-top: 1rem; text-align: right; font-size: 0.875rem; }
    .upcoming-events .calendar-link a { color: #0066cc; }
    .upcoming-events .event-row.cancelled { opacity: 0.7; }
    .upcoming-events .cancelled-date { color: #999; }
    .upcoming-events .next-date { color: #666; font-size: 0.875em; }
    .upcoming-events .cancelled-badge {
      background: #dc3545;
      color: white;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="upcoming-events">
    <table>
      <thead>
        <tr>
          <th colspan="2">Nächste Veranstaltungen</th>
        </tr>
      </thead>
      <tbody class="upcoming-events-table-body">
${rows}
      </tbody>
    </table>
    <div class="calendar-link">
      <a href="${escapeHtml(calendarLink)}">Alle Veranstaltungen im Kalender &rarr;</a>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
