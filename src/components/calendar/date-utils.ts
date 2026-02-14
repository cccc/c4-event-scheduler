// Helper to format Date for datetime-local input (local timezone)
export function toLocalDateTimeString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper to format Date for date input (YYYY-MM-DD)
export function toLocalDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// Helper to format Date for time input (HH:MM)
export function toLocalTimeString(date: Date): string {
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}

// Helper to parse datetime-local input value to Date (treats input as local time)
export function parseLocalDateTime(value: string): Date {
	// datetime-local gives us "YYYY-MM-DDTHH:MM" in local time
	// new Date() with this format parses as local time
	return new Date(value);
}

// Combine a date string (YYYY-MM-DD) and time string (HH:MM) into a Date
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
	return new Date(`${dateStr}T${timeStr}`);
}

// If dtend is before or equal to dtstart (e.g., start 23:00, end 01:00),
// assume the end time is on the next day and add 24 hours.
export function adjustEndDate(dtstart: Date, dtend: Date): Date {
	if (dtend.getTime() <= dtstart.getTime()) {
		return new Date(dtend.getTime() + 24 * 60 * 60 * 1000);
	}
	return dtend;
}
