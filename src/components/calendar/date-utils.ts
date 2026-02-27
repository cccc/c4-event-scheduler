import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { env } from "@/env";

const tz = env.NEXT_PUBLIC_APP_TIMEZONE;

// Helper to format Date for datetime-local input (app timezone)
export function toLocalDateTimeString(date: Date): string {
	return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm");
}

// Helper to format Date for date input (YYYY-MM-DD, in app timezone)
export function toLocalDateString(date: Date): string {
	return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

// Helper to format Date for time input (HH:MM, in app timezone)
export function toLocalTimeString(date: Date): string {
	return formatInTimeZone(date, tz, "HH:mm");
}

// Helper to parse datetime-local input value to Date (treats input as app timezone)
export function parseLocalDateTime(value: string): Date {
	return fromZonedTime(value, tz);
}

// Combine a date string (YYYY-MM-DD) and time string (HH:MM) into a Date (in app timezone)
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
	return fromZonedTime(`${dateStr}T${timeStr}`, tz);
}

// If dtend is before or equal to dtstart (e.g., start 23:00, end 01:00),
// assume the end time is on the next day and add 24 hours.
export function adjustEndDate(dtstart: Date, dtend: Date): Date {
	if (dtend.getTime() <= dtstart.getTime()) {
		return new Date(dtend.getTime() + 24 * 60 * 60 * 1000);
	}
	return dtend;
}

// Parse a YYYY-MM-DD date string as end-of-day in the app timezone,
// so that series UNTIL dates include all occurrences on that day.
export function parseDateAsEndOfDayInTz(dateStr: string): Date {
	return fromZonedTime(`${dateStr}T23:59:59`, tz);
}
