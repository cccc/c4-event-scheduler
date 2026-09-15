import { addMonths } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// All helpers take the app timezone as a parameter rather than reading it
// from the build-baked `env`. In client code, get it from `useAppTimezone()`;
// in server code, pass `env.APP_TIMEZONE` directly.

// Helper to format Date for datetime-local input (app timezone)
export function toLocalDateTimeString(date: Date, tz: string): string {
    return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm");
}

// Helper to format Date for date input (YYYY-MM-DD, in app timezone)
export function toLocalDateString(date: Date, tz: string): string {
    return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

// Helper to format Date for time input (HH:MM, in app timezone)
export function toLocalTimeString(date: Date, tz: string): string {
    return formatInTimeZone(date, tz, "HH:mm");
}

// Helper to parse datetime-local input value to Date (treats input as app timezone)
export function parseLocalDateTime(value: string, tz: string): Date {
    return fromZonedTime(value, tz);
}

// Combine a date string (YYYY-MM-DD) and time string (HH:MM) into a Date (in app timezone)
export function combineDateAndTime(
    dateStr: string,
    timeStr: string,
    tz: string,
): Date {
    return fromZonedTime(`${dateStr}T${timeStr}`, tz);
}

// Default end time offered by the forms when an event has none
export function oneHourLater(date: Date): Date {
    return new Date(date.getTime() + 60 * 60 * 1000);
}

// If dtend is before or equal to dtstart (e.g., start 23:00, end 01:00),
// assume the end time is on the next day and add 24 hours.
export function adjustEndDate(dtstart: Date, dtend: Date): Date {
    if (dtend.getTime() <= dtstart.getTime()) {
        return new Date(dtend.getTime() + 24 * 60 * 60 * 1000);
    }
    return dtend;
}

// End time to display: the stored end, or dtstart + the event type's default
// duration for open-end events (null when there is neither).
export function effectiveEnd(occurrence: {
    dtstart: Date;
    dtend: Date | null;
    eventType: { defaultDurationMinutes: number | null } | null;
}): Date | null {
    if (occurrence.dtend) return occurrence.dtend;
    const minutes = occurrence.eventType?.defaultDurationMinutes;
    if (!minutes) return null;
    return new Date(occurrence.dtstart.getTime() + minutes * 60_000);
}

// Human-readable duration, e.g. 90 -> "1 h 30 min", 120 -> "2 h", 45 -> "45 min"
export function formatDurationMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest} min`;
    if (rest === 0) return `${hours} h`;
    return `${hours} h ${rest} min`;
}

// Parse a YYYY-MM-DD date string as end-of-day in the app timezone,
// so that series UNTIL dates include all occurrences on that day.
export function parseDateAsEndOfDayInTz(dateStr: string, tz: string): Date {
    return fromZonedTime(`${dateStr}T23:59:59`, tz);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Monday on or before (`before`) / on or after the given wall-clock date
function weekBoundary(day: string, before: boolean): string {
    const d = new Date(`${day}T00:00:00Z`);
    const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
    const shift = before ? -weekday : (7 - weekday) % 7;
    return new Date(d.getTime() + shift * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The days the month grid shows for `base`'s month: whole weeks (Monday
 * first) from the week of the 1st to the week of the last day, as an
 * exclusive range of app-timezone midnights. This is what the space
 * calendar fetches before FullCalendar reports its visible range, and it
 * equals that range, so the loader's prefetch is what the month view reads.
 */
export function initialCalendarRange(
    base: Date,
    tz: string,
): { start: Date; end: Date } {
    const monthKey = formatInTimeZone(base, tz, "yyyy-MM");
    const first = `${monthKey}-01`;
    const nextFirst = formatInTimeZone(
        addMonths(new Date(`${first}T00:00:00Z`), 1),
        "UTC",
        "yyyy-MM-dd",
    );
    return {
        start: fromZonedTime(`${weekBoundary(first, true)}T00:00:00`, tz),
        end: fromZonedTime(`${weekBoundary(nextFirst, false)}T00:00:00`, tz),
    };
}
