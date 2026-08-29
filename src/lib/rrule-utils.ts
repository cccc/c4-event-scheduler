import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { RRule } from "rrule";

/**
 * Formats a UTC date as YYYY-MM-DD using the wall-clock date in the given
 * timezone. Differs from `.toISOString().slice(0, 10)` for events near
 * midnight where the UTC date and local date differ.
 */
export function formatOccurrenceDate(d: Date, tz: string): string {
    return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

/**
 * Pack the wall-clock components of `d` in `tz` into a Date whose UTC fields
 * match. e.g. 2024-01-09T17:00Z in Europe/Berlin (CET +1) → 2024-01-09T18:00Z.
 *
 * Intentionally avoids date-fns-tz's `toZonedTime`. Internally it computes the
 * shifted instant correctly, but then encodes the result via `setFullYear` /
 * `setHours` — which write *system-local* fields. The Date round-trips back
 * through `fromZonedTime` (which reads via `getHours()`, also system-local),
 * so the pair works as advertised. But `getUTCHours()` on the intermediate
 * Date only returns the target wall-clock when the system TZ is UTC. On a
 * server whose system TZ equals `tz`, it returns the original real-UTC hour,
 * and anything that inspects UTC fields between the two calls (like rrule's
 * expansion) sees unshifted times.
 */
function wallClockAsUtc(d: Date, tz: string): Date {
    return new Date(`${formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm:ss.SSS")}Z`);
}

/**
 * Inverse of wallClockAsUtc: read UTC fields of `d` as wall-clock in `tz`.
 *
 * Built on date-fns-tz's `fromZonedTime` string branch, which parses the
 * components as `tz` directly — unlike the Date branch, which reads via
 * system-local getters.
 */
function wallClockToUtc(d: Date, tz: string): Date {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    const se = String(d.getUTCSeconds()).padStart(2, "0");
    const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
    return fromZonedTime(`${y}-${mo}-${da}T${h}:${mi}:${se}.${ms}`, tz);
}

/**
 * Expand an RRULE into occurrences within a date range, correctly handling DST.
 *
 * rrule.js operates on Date objects via their UTC fields, so expanding a real
 * UTC dtstart directly produces occurrences that drift at DST boundaries (e.g.
 * 18:00 CET becomes 19:00 CEST). This function instead:
 *
 *   1. Packs dtstart's wall-clock in `tz` into a Date's UTC fields
 *      (2024-01-09T17:00Z / 18:00 CET → 2024-01-09T18:00Z fake-UTC).
 *   2. Lets rrule expand in that wall-clock space.
 *   3. Reads each result's UTC fields back as wall-clock in `tz` to recover
 *      the real UTC instant (2024-04-02T18:00Z fake → 2024-04-02T16:00Z real,
 *      i.e. 18:00 CEST).
 */
export function expandRruleInTimezone(
    rruleStr: string,
    dtstart: Date,
    rangeStart: Date,
    rangeEnd: Date,
    tz: string,
): Date[] {
    const base = RRule.fromString(rruleStr);
    const rule = new RRule({
        ...base.origOptions,
        dtstart: wallClockAsUtc(dtstart, tz),
    });

    // Subtract 1 s from the lower bound so the first occurrence is never
    // excluded by a floating-point boundary inside RRule.between.
    const queryStart = new Date(
        Math.min(dtstart.getTime(), rangeStart.getTime()) - 1_000,
    );

    return rule
        .between(
            wallClockAsUtc(queryStart, tz),
            wallClockAsUtc(rangeEnd, tz),
            true,
        )
        .map((d) => wallClockToUtc(d, tz));
}
