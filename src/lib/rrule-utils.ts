import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { RRule } from "rrule";

/**
 * Formats a UTC date as YYYY-MM-DD using the wall-clock date in the given
 * timezone. Differs from `.toISOString().slice(0, 10)` for events near
 * midnight where the UTC date and local date differ.
 */
export function formatOccurrenceDate(d: Date, tz: string): string {
    // toZonedTime shifts the timestamp so UTC components = local time in tz
    const zoned = toZonedTime(d, tz);
    const year = zoned.getUTCFullYear();
    const month = String(zoned.getUTCMonth() + 1).padStart(2, "0");
    const day = String(zoned.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Expand an RRULE into occurrences within a date range, correctly handling DST.
 *
 * The rrule library works in UTC, which causes events at "19:00 Europe/Berlin"
 * to shift by one hour at DST boundaries. This function works in the "wall
 * clock" space of the target timezone instead:
 *
 *   1. Convert dtstart to fake-UTC where UTC components = local time in tz
 *      e.g. 2024-01-09T18:00Z (CET +1) → fake 2024-01-09T19:00Z
 *   2. Expand the RRULE in that fake-UTC space
 *   3. Convert each result back to real UTC via fromZonedTime
 *      e.g. fake 2024-07-09T19:00Z (CEST +2) → real 2024-07-09T17:00Z ✓
 *
 * Result: "every Tuesday at 19:00 Berlin" stays at 19:00 Berlin time year-round.
 */
export function expandRruleInTimezone(
    rruleStr: string,
    dtstart: Date,
    rangeStart: Date,
    rangeEnd: Date,
    tz: string,
): Date[] {
    const base = RRule.fromString(rruleStr);
    const zonedStart = toZonedTime(dtstart, tz);

    const rule = new RRule({
        ...base.origOptions,
        dtstart: zonedStart,
    });

    // Subtract 1 s from the lower bound so the first occurrence is never
    // excluded by a floating-point boundary inside RRule.between.
    const queryStart = new Date(
        Math.min(dtstart.getTime(), rangeStart.getTime()) - 1_000,
    );

    return rule
        .between(toZonedTime(queryStart, tz), toZonedTime(rangeEnd, tz), true)
        .map((d) => fromZonedTime(d, tz));
}
