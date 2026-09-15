import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { effectiveEnd } from "@/components/calendar/date-utils";
import type { Occurrence } from "@/components/calendar/types";

const HOUR_MS = 60 * 60 * 1000;

// Shown when the visible range has no timed events
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
// The grid never gets shorter than this, so a single short event does not
// leave a sliver of a calendar
const MIN_SPAN_HOURS = 4;
// Breathing room before the first and after the last event
const PADDING_HOURS = 1;

function toDuration(hours: number): string {
    return `${String(hours).padStart(2, "0")}:00:00`;
}

export type TimeWindow = {
    /** FullCalendar slotMinTime, e.g. "17:00:00" */
    slotMinTime: string;
    /** FullCalendar slotMaxTime; past "24:00:00" for events after midnight */
    slotMaxTime: string;
};

export const DEFAULT_TIME_WINDOW: TimeWindow = {
    slotMinTime: toDuration(DEFAULT_START_HOUR),
    slotMaxTime: toDuration(DEFAULT_END_HOUR),
};

function midnightOf(date: Date, tz: string): number {
    const day = formatInTimeZone(date, tz, "yyyy-MM-dd");
    return fromZonedTime(`${day}T00:00:00`, tz).getTime();
}

/**
 * The hour range the time grid needs so that every timed event's start and
 * end are visible, whole hours in the app timezone plus an hour of padding
 * on both ends:
 * - an event within a day, or crossing midnight once, from its start to its
 *   end counted from its start day (so 22:00 to 02:30 needs 21:00 to 27:00;
 *   FullCalendar draws hours past 24 at the bottom of the same column and
 *   extends its date range by a day for them)
 * - an event of a day or longer shows its start on the first day and its end
 *   on the last day; the start hour counts when the first day is visible,
 *   the end hour when the last day is (the days in between are full
 *   columns whatever the window)
 *
 * `visible` is the range of days on screen. Only its occurrences count: the
 * extended date range also fetches the following day, whose events must not
 * widen the window (that would feed back into the range).
 */
export function timeWindowFor(
    occurrences: readonly Occurrence[] | undefined,
    visible: { start: Date; end: Date },
    tz: string,
): TimeWindow {
    let startHour = Number.POSITIVE_INFINITY;
    let endHour = Number.NEGATIVE_INFINITY;
    const cover = (from: number, to: number) => {
        startHour = Math.min(startHour, Math.floor(from));
        endHour = Math.max(endHour, Math.ceil(to));
    };
    for (const occ of occurrences ?? []) {
        if (occ.allDay) continue;
        const startMidnight = midnightOf(occ.dtstart, tz);
        const start = (occ.dtstart.getTime() - startMidnight) / HOUR_MS;
        const startVisible =
            occ.dtstart >= visible.start && occ.dtstart < visible.end;
        const end = effectiveEnd(occ);
        if (!end) {
            if (startVisible) cover(start, start + 1);
        } else if (end.getTime() - occ.dtstart.getTime() < 24 * HOUR_MS) {
            if (startVisible) {
                cover(start, (end.getTime() - startMidnight) / HOUR_MS);
            }
        } else {
            if (startVisible) cover(start, start + 1);
            // An end exactly at midnight is the previous day's 24:00
            const endRel = (end.getTime() - midnightOf(end, tz)) / HOUR_MS;
            const lastDayEnd = endRel === 0 ? 24 : endRel;
            const endVisible = end > visible.start && end <= visible.end;
            if (endVisible) cover(Math.max(0, lastDayEnd - 1), lastDayEnd);
        }
    }
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) {
        return DEFAULT_TIME_WINDOW;
    }
    startHour = Math.max(0, startHour - PADDING_HOURS);
    endHour = Math.min(
        48,
        Math.max(endHour + PADDING_HOURS, startHour + MIN_SPAN_HOURS),
    );
    return {
        slotMinTime: toDuration(startHour),
        slotMaxTime: toDuration(endHour),
    };
}
