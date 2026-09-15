import { createFileRoute } from "@tanstack/react-router";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { env } from "@/env";
import { expandRruleInTimezone, formatOccurrenceDate } from "@/lib/rrule-utils";
import { db } from "@/server/db";
import { event, space } from "@/server/db/schema";

type UpcomingEvent = {
    id: string;
    summary: string;
    description: string | null;
    url: string | null;
    date: string; // ISO date of next occurrence
    dateLabel: string; // Human-readable date/frequency
    isRecurring: boolean;
    spaceName: string;
    spaceSlug: string;
    eventTypeName: string;
    calendarUrl: string; // Deep link opening this occurrence in the calendar
    // Cancellation info
    isCancelled: boolean; // Is the immediate next occurrence cancelled?
    cancelledDate: string | null; // Date that was cancelled
    cancelledDateLabel: string | null; // Human-readable cancelled date
    nextAfterCancelled: string | null; // ISO date of next non-cancelled occurrence
    nextAfterCancelledLabel: string | null; // Human-readable date of next after cancelled
};

// Format date in German locale, always in the app timezone
function formatDate(date: Date, locale = "de-DE"): string {
    return date.toLocaleString(locale, {
        timeZone: env.APP_TIMEZONE,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function startOfDay(d: Date, tz: string): Date {
    return fromZonedTime(
        `${formatInTimeZone(d, tz, "yyyy-MM-dd")}T00:00:00`,
        tz,
    );
}

function endOfDay(d: Date, tz: string): Date {
    return fromZonedTime(
        `${formatInTimeZone(d, tz, "yyyy-MM-dd")}T23:59:59.999`,
        tz,
    );
}

/**
 * An occurrence stays listed until it is over: past its end time, or past
 * the end of its day (app timezone) when it has no end time. So an event
 * that has already started still shows up.
 */
function isOver(start: Date, end: Date | null, now: Date, tz: string) {
    return (end ?? endOfDay(start, tz)) <= now;
}

async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const spaceSlug = searchParams.get("space");
    const limit = Math.min(Number(searchParams.get("limit")) || 10, 50);
    const months = Math.min(
        Math.max(Number(searchParams.get("months")) || 6, 1),
        24,
    );
    const format = searchParams.get("format") || "json";
    const locale = searchParams.get("locale") || "de-DE";
    const tz = env.APP_TIMEZONE;

    // Build query conditions
    const conditions: ReturnType<typeof eq>[] = [];
    let allowedSpaceIds: string[] | null = null;

    if (spaceSlug) {
        const spaceRecord = await db.query.space.findFirst({
            where: and(eq(space.slug, spaceSlug), eq(space.isPublic, true)),
        });

        if (!spaceRecord) {
            return new Response("Space not found or not public", {
                status: 404,
            });
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

    // Only include non-draft confirmed or tentative events
    conditions.push(eq(event.isDraft, false));
    conditions.push(
        or(
            eq(event.status, "confirmed"),
            eq(event.status, "tentative"),
        ) as ReturnType<typeof eq>,
    );

    const now = new Date();
    const rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + months);

    // Pre-filter at the DB level: only fetch events whose active range
    // intersects [now, rangeEnd]; isOver() decides precisely below
    conditions.push(
        or(
            // Single events: not over yet (still running, or today without
            // an end time) and starting within the range
            and(
                isNull(event.rrule),
                lte(event.dtstart, rangeEnd),
                or(
                    gte(event.dtend, now),
                    and(
                        isNull(event.dtend),
                        gte(event.dtstart, startOfDay(now, tz)),
                    ),
                ),
            ),
            // Recurring events: series must overlap the range
            and(
                isNotNull(event.rrule),
                lte(event.dtstart, rangeEnd),
                or(
                    isNull(event.recurrenceEndDate),
                    gte(event.recurrenceEndDate, now),
                ),
            ),
        ) as ReturnType<typeof eq>,
    );

    // Fetch events
    const events = await db.query.event.findMany({
        where: and(...conditions),
        with: {
            space: true,
            eventType: true,
            overrides: true,
        },
    });

    // Collect upcoming occurrences
    const upcomingEvents: UpcomingEvent[] = [];

    for (const evt of events) {
        const calendarUrl = (occDate: string) =>
            `${env.APP_URL}/spaces/${evt.space.slug}?date=${occDate}&event=${evt.id}`;

        // Parse exdates for recurring events
        const exdatesSet = new Set(evt.exdates ?? []);

        if (!evt.rrule) {
            // Single event - only include if not over yet and within range
            if (evt.dtstart <= rangeEnd) {
                const occDate = formatOccurrenceDate(evt.dtstart, tz);
                const override = evt.overrides.find(
                    (o) => o.occurrenceDate === occDate,
                );
                const status = override?.status ?? evt.status;
                const isInternal = evt.eventType?.isInternal ?? false;

                if (isInternal) continue;
                // An inherited end keeps the event's duration from a moved start
                const start = override?.dtstart ?? evt.dtstart;
                const end =
                    override?.dtend ??
                    (evt.dtend
                        ? new Date(
                              start.getTime() +
                                  evt.dtend.getTime() -
                                  evt.dtstart.getTime(),
                          )
                        : null);
                if (isOver(start, end, now, tz)) continue;

                const isCancelled = status === "cancelled";

                upcomingEvents.push({
                    id: `${evt.id}:${occDate}`,
                    summary: override?.summary ?? evt.summary,
                    description: override?.description ?? evt.description,
                    url: override?.url ?? evt.url,
                    date: start.toISOString(),
                    dateLabel: formatDate(start, locale),
                    isRecurring: false,
                    spaceName: evt.space.name,
                    spaceSlug: evt.space.slug,
                    eventTypeName: evt.eventType.name,
                    calendarUrl: calendarUrl(occDate),
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
                const endDate = evt.recurrenceEndDate
                    ? new Date(
                          Math.min(
                              evt.recurrenceEndDate.getTime(),
                              rangeEnd.getTime(),
                          ),
                      )
                    : rangeEnd;

                // DST-aware expansion; the helper expands from the series
                // start regardless of the range start, past occurrences are
                // skipped in the loop below
                const nextDates = expandRruleInTimezone(
                    evt.rrule,
                    evt.dtstart,
                    now,
                    endDate,
                    tz,
                );
                if (nextDates.length === 0) continue;
                const durationMs = evt.dtend
                    ? evt.dtend.getTime() - evt.dtstart.getTime()
                    : 0;

                // Find first valid occurrence (skip exdates/internal) and check if it's cancelled
                let firstValidDate: Date | null = null;
                let firstValidStatus: string | null = null;
                let nextNonCancelledDate: Date | null = null;

                for (const date of nextDates) {
                    const occDate = formatOccurrenceDate(date, tz);
                    const isInternal = evt.eventType?.isInternal ?? false;

                    // Skip exdates and internal
                    if (exdatesSet.has(occDate) || isInternal) continue;

                    const override = evt.overrides.find(
                        (o) => o.occurrenceDate === occDate,
                    );
                    const status = override?.status ?? evt.status;
                    const start = override?.dtstart ?? date;
                    const end =
                        override?.dtend ??
                        (durationMs > 0
                            ? new Date(start.getTime() + durationMs)
                            : null);
                    if (isOver(start, end, now, tz)) continue;

                    if (!firstValidDate) {
                        firstValidDate = date;
                        firstValidStatus = status;
                        // If first valid is not cancelled, we're done
                        if (status !== "cancelled") {
                            nextNonCancelledDate = date;
                            break;
                        }
                    } else if (
                        status !== "cancelled" &&
                        !nextNonCancelledDate
                    ) {
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
                    summary: evt.summary,
                    description: evt.description,
                    url: evt.url,
                    date: (
                        nextNonCancelledDate ?? firstValidDate
                    ).toISOString(),
                    dateLabel,
                    isRecurring: true,
                    spaceName: evt.space.name,
                    spaceSlug: evt.space.slug,
                    eventTypeName: evt.eventType.name,
                    calendarUrl: calendarUrl(
                        formatOccurrenceDate(
                            nextNonCancelledDate ?? firstValidDate,
                            tz,
                        ),
                    ),
                    isCancelled,
                    cancelledDate: isCancelled
                        ? firstValidDate.toISOString()
                        : null,
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
        ? `${env.APP_URL}/spaces/${spaceSlug}`
        : `${env.APP_URL}/spaces`;

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
                    ? `<a href="${escapeHtml(evt.url)}">${escapeHtml(evt.summary)}</a>`
                    : escapeHtml(evt.summary);

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

export const Route = createFileRoute("/api/widget/upcoming")({
    server: {
        handlers: {
            GET: ({ request }) => GET(request),
        },
    },
});
