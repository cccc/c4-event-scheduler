/**
 * The space calendar's `?event=` deep link: an event id, or one occurrence
 * as `<event id>.<occurrence date>`. The occurrence date is the one in the
 * occurrence id (YYYY-MM-DD in the app timezone, the series date before any
 * override moved it), so the link stays valid when the occurrence is
 * rescheduled. `.` because URL encoding leaves it as is (`:` or `@` would
 * become %3A / %40).
 */
export const EVENT_LINK_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.\d{4}-\d{2}-\d{2})?$/i;

export type EventLink = { eventId: string; occurrenceDate?: string };

export function formatEventLink(eventId: string, occurrenceDate?: string) {
    return occurrenceDate ? `${eventId}.${occurrenceDate}` : eventId;
}

export function parseEventLink(value: string | undefined): EventLink | null {
    if (!value || !EVENT_LINK_PATTERN.test(value)) return null;
    const [eventId, occurrenceDate] = value.split(".") as [string, string?];
    return { eventId, occurrenceDate };
}

/** The id of the linked occurrence (`<event id>:<date>`), if it names one */
export function linkedOccurrenceId(link: EventLink | null): string | null {
    return link?.occurrenceDate
        ? `${link.eventId}:${link.occurrenceDate}`
        : null;
}
