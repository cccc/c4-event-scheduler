import { and, count, eq, isNotNull, isNull, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
import { event, occurrenceOverride, space } from "@/server/db/schema";

/** What a delete takes with it, in stored rows (a series is never expanded). */
export type EventImpact = {
    /** Events without a recurrence rule */
    singles: number;
    /** Recurring events; each may stand for an unbounded number of occurrences */
    series: number;
    /** Per-occurrence modifications of those series (cancelled, moved, renamed) */
    overrides: number;
};

export type EventImpactBySpace = EventImpact & { slug: string; name: string };

/** Sum used for the confirmation tier and the number typed back */
export function impactTotal(impact: EventImpact): number {
    return impact.singles + impact.series + impact.overrides;
}

/**
 * Count the events matching `where` per space, split into single events,
 * series and the overrides hanging off those series.
 */
export async function eventImpactBySpace(
    where: SQL,
): Promise<EventImpactBySpace[]> {
    const bySpace = new Map<string, EventImpactBySpace>();
    const entry = (row: { slug: string; name: string }) => {
        let e = bySpace.get(row.slug);
        if (!e) {
            e = { ...row, singles: 0, series: 0, overrides: 0 };
            bySpace.set(row.slug, e);
        }
        return e;
    };

    const singles = await db
        .select({ slug: space.slug, name: space.name, n: count() })
        .from(event)
        .innerJoin(space, eq(event.spaceId, space.id))
        .where(and(where, isNull(event.rrule)))
        .groupBy(space.slug, space.name);
    for (const row of singles) entry(row).singles = row.n;

    const series = await db
        .select({ slug: space.slug, name: space.name, n: count() })
        .from(event)
        .innerJoin(space, eq(event.spaceId, space.id))
        .where(and(where, isNotNull(event.rrule)))
        .groupBy(space.slug, space.name);
    for (const row of series) entry(row).series = row.n;

    const overrides = await db
        .select({ slug: space.slug, name: space.name, n: count() })
        .from(occurrenceOverride)
        .innerJoin(event, eq(occurrenceOverride.eventId, event.id))
        .innerJoin(space, eq(event.spaceId, space.id))
        .where(where)
        .groupBy(space.slug, space.name);
    for (const row of overrides) entry(row).overrides = row.n;

    return [...bySpace.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sumImpact(rows: EventImpact[]): EventImpact {
    return rows.reduce(
        (acc, r) => ({
            singles: acc.singles + r.singles,
            series: acc.series + r.series,
            overrides: acc.overrides + r.overrides,
        }),
        { singles: 0, series: 0, overrides: 0 },
    );
}
