/** Shared wording for what a delete takes with it (see server/event-impact). */

export type EventImpact = {
    singles: number;
    series: number;
    overrides: number;
};

export function impactTotal(impact: EventImpact): number {
    return impact.singles + impact.series + impact.overrides;
}

function plural(n: number, one: string, many: string) {
    return `${n} ${n === 1 ? one : many}`;
}

/** "2 single events, 1 series with 3 overridden occurrences" */
export function describeImpact(impact: EventImpact): string {
    const parts = [plural(impact.singles, "single event", "single events")];
    if (impact.series > 0 || impact.overrides > 0) {
        parts.push(
            `${plural(impact.series, "series", "series")} with ${plural(
                impact.overrides,
                "overridden occurrence",
                "overridden occurrences",
            )}`,
        );
    }
    return parts.join(", ");
}

/**
 * Usage line on the event types page: "1 series · 2 single events", series
 * first, zero parts left out; null when there is nothing (the caller renders
 * "no events" in its own style).
 */
export function describeUsage(impact: EventImpact): string | null {
    const parts: string[] = [];
    if (impact.series > 0)
        parts.push(plural(impact.series, "series", "series"));
    if (impact.singles > 0) {
        parts.push(plural(impact.singles, "single event", "single events"));
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}

/** The event-related bullet points of a delete confirmation. */
export function EventImpactItems({
    impact,
    loaded,
}: {
    impact: EventImpact | undefined;
    loaded: boolean;
}) {
    if (!loaded || !impact) {
        return <li>Counting events…</li>;
    }
    return (
        <>
            <li>
                <strong>
                    {plural(impact.singles, "single event", "single events")}
                </strong>
            </li>
            <li>
                <strong>{plural(impact.series, "series", "series")}</strong>{" "}
                (every future occurrence of them) with{" "}
                <strong>
                    {plural(
                        impact.overrides,
                        "overridden occurrence",
                        "overridden occurrences",
                    )}
                </strong>{" "}
                (cancelled, moved or renamed dates)
            </li>
        </>
    );
}
