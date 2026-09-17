/**
 * Date and time display, always de-DE in the app timezone (`tz`, from the
 * root route context or `useAppTimezone`), so the server render and the
 * browser agree.
 */

/** "Donnerstag, 3. September 2026" */
export function formatDate(date: Date, tz: string): string {
    return date.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: tz,
    });
}

/** "10.9.2026" */
export function formatShortDate(date: Date, tz: string): string {
    return date.toLocaleDateString("de-DE", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone: tz,
    });
}

/** "18:00" */
export function formatTime(date: Date, tz: string): string {
    return date.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
    });
}

/** "3. Sept. 2026, 18:00" */
export function formatDateTime(date: Date, tz: string): string {
    return date.toLocaleString("de-DE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
    });
}

/** "Di., 16.09., 19:00" */
export function formatShortDateTime(date: Date, tz: string): string {
    return date.toLocaleString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
    });
}

/**
 * One compact line for a span that ends on a later day, e.g.
 * "Sa., 12. Sept. 2026, 12:00 – Mo., 14. Sept. 2026, 14:00". ICU versions
 * differ in the spaces they put around the dash (Node uses thin spaces,
 * browsers regular ones), which would break hydration; normalized to plain
 * spaces
 */
export function formatDateTimeRange(
    start: Date,
    end: Date,
    tz: string,
): string {
    return new Intl.DateTimeFormat("de-DE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
    })
        .formatRange(start, end)
        .replace(/[   ]/g, " ");
}

/** A YYYY-MM-DD date (no time, no zone) as "Do., 3. September 2026" */
export function formatDateOnly(dateStr: string): string {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return dateStr;
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
        "de-DE",
        {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        },
    );
}
