import {
    OccurrenceBadges,
    OccurrenceContent,
} from "@/components/calendar/event-details-dialog";
import type { Occurrence } from "@/components/calendar/types";
import { spaceRoute } from "@/components/calendar/use-calendar-deep-link";

/**
 * The details of a deep-linked occurrence (?event= with ?date=) as a card
 * above the calendar, for visitors without JavaScript: the dialog cannot be
 * server-rendered (it lives in a portal). Hidden as soon as scripts run; the
 * dialog takes over then. Rendered from the same prefetched occurrences the
 * calendar shows, so it is part of the server HTML.
 */
export function LinkedOccurrenceCard({
    occurrences,
}: {
    occurrences: ReadonlyMap<string, Occurrence>;
}) {
    const { event, date } = spaceRoute.useSearch();
    const occurrence =
        event && date ? occurrences.get(`${event}:${date}`) : undefined;
    if (!occurrence) return null;
    return (
        <div className="noscript-only">
            <section
                aria-label={occurrence.summary}
                className="mb-6 space-y-4 rounded-lg border bg-card p-6"
            >
                <div className="space-y-1">
                    <h2 className="font-semibold text-xl">
                        {occurrence.summary}
                    </h2>
                    <OccurrenceBadges occurrence={occurrence} />
                </div>
                <OccurrenceContent
                    canEdit={false}
                    occurrence={occurrence}
                    showActions={false}
                />
            </section>
        </div>
    );
}
