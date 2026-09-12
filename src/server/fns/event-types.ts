import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { authed, withActor } from "@/server/auth-middleware";
import type { db as Db } from "@/server/db";
import {
    event,
    eventType,
    occurrenceOverride,
    space,
} from "@/server/db/schema";
import {
    type EventImpact,
    eventImpactBySpace,
    sumImpact,
} from "@/server/event-impact";
import { notFound } from "@/server/fn-errors";
import { expandOccurrences } from "@/server/occurrences";
import { assertCan } from "@/server/permissions";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
const slugPattern = /^[a-z0-9-]+$/;

/**
 * Internal event types are only visible to signed-in users. Returns the extra
 * where-condition to apply for the current session (undefined = no filter).
 */
function visibilityFilter(session: { user: unknown } | null): SQL | undefined {
    return session?.user ? undefined : eq(eventType.isInternal, false);
}

const listSchema = z
    .object({
        // Filter to only global event types (spaceId is null)
        globalOnly: z.boolean().optional().default(false),
        // Filter to event types available in a specific space (global + space-specific)
        spaceId: z.string().uuid().optional(),
    })
    .optional();

/**
 * How much each event type is used (single events, series, overrides).
 * `publicOnly` restricts the count to what anonymous visitors can see
 * (no drafts, public spaces only).
 */
async function usageByEventType(
    db: typeof Db,
    publicOnly: boolean,
): Promise<Map<string, EventImpact>> {
    const usage = new Map<string, EventImpact>();
    const entry = (id: string) => {
        let e = usage.get(id);
        if (!e) {
            e = { singles: 0, series: 0, overrides: 0 };
            usage.set(id, e);
        }
        return e;
    };
    const visible = publicOnly
        ? and(eq(event.isDraft, false), eq(space.isPublic, true))
        : undefined;
    const singles = await db
        .select({ id: event.eventTypeId, n: count() })
        .from(event)
        .innerJoin(space, eq(event.spaceId, space.id))
        .where(and(isNull(event.rrule), visible))
        .groupBy(event.eventTypeId);
    for (const row of singles) entry(row.id).singles = row.n;
    const series = await db
        .select({ id: event.eventTypeId, n: count() })
        .from(event)
        .innerJoin(space, eq(event.spaceId, space.id))
        .where(and(isNotNull(event.rrule), visible))
        .groupBy(event.eventTypeId);
    for (const row of series) entry(row.id).series = row.n;
    const overrides = await db
        .select({ id: event.eventTypeId, n: count() })
        .from(occurrenceOverride)
        .innerJoin(event, eq(occurrenceOverride.eventId, event.id))
        .innerJoin(space, eq(event.spaceId, space.id))
        .where(visible)
        .groupBy(event.eventTypeId);
    for (const row of overrides) entry(row.id).overrides = row.n;
    return usage;
}

const NO_USAGE: EventImpact = { singles: 0, series: 0, overrides: 0 };

export const list = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(listSchema)
    .handler(async ({ data, context }) => {
        const visible = visibilityFilter(context.session);

        // Global only; global + one space's own types; or everything
        const where = data?.globalOnly
            ? and(isNull(eventType.spaceId), visible)
            : data?.spaceId
              ? and(
                    or(
                        isNull(eventType.spaceId),
                        eq(eventType.spaceId, data.spaceId),
                    ),
                    visible,
                )
              : visible;

        const rows = await context.db.query.eventType.findMany({
            where,
            with: { space: true },
            orderBy: (types, { asc }) => [asc(types.name)],
        });

        const signedIn = !!context.session?.user;
        const usage = await usageByEventType(context.db, !signedIn);
        const withUsage = rows.map((row) => ({
            ...row,
            usage: usage.get(row.id) ?? NO_USAGE,
        }));
        // Signed-in users see every type with its counts; anonymous visitors
        // only see types that have at least one event visible to them, and
        // no counts (they would hint at drafts and private spaces)
        return signedIn
            ? withUsage
            : withUsage
                  .filter((row) => row.usage.singles + row.usage.series > 0)
                  .map((row) => ({ ...row, usage: null }));
    });

const upcomingSchema = z
    .object({
        months: z.number().int().min(1).max(24).default(6),
        perType: z.number().int().min(1).max(5).default(2),
    })
    .optional();

export type UpcomingOccurrence = {
    id: string;
    eventId: string;
    occurrenceDate: string;
    summary: string;
    dtstart: Date;
    dtend: Date | null;
    status: "tentative" | "confirmed" | "cancelled";
    isDraft: boolean;
    spaceSlug: string;
    spaceName: string;
};

/**
 * The next few occurrences of every event type (visibility rules of the
 * caller apply), keyed by event type id, for the event types page.
 */
export const upcoming = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(upcomingSchema)
    .handler(async ({ data, context }) => {
        const months = data?.months ?? 6;
        const perType = data?.perType ?? 2;
        const start = new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);

        // Sorted by start already
        const occurrences = await expandOccurrences(
            context.db,
            { start, end },
            !!context.session?.user,
        );
        const byType: Record<string, UpcomingOccurrence[]> = {};
        for (const occ of occurrences) {
            const list = byType[occ.eventType.id] ?? [];
            byType[occ.eventType.id] = list;
            if (list.length >= perType) continue;
            list.push({
                id: occ.id,
                eventId: occ.eventId,
                occurrenceDate: occ.occurrenceDate,
                summary: occ.summary,
                dtstart: occ.dtstart,
                dtend: occ.dtend,
                status: occ.status,
                isDraft: occ.isDraft,
                spaceSlug: occ.space.slug,
                spaceName: occ.space.name,
            });
        }
        return byType;
    });

export const getBySlug = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(z.object({ slug: z.string() }))
    .handler(async ({ data, context }) => {
        const result = await context.db.query.eventType.findFirst({
            where: and(
                eq(eventType.slug, data.slug),
                visibilityFilter(context.session),
            ),
        });
        return result ?? null;
    });

export const getBySpace = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(z.object({ spaceId: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        // Return global event types + event types specific to this space
        return context.db.query.eventType.findMany({
            where: and(
                or(
                    isNull(eventType.spaceId),
                    eq(eventType.spaceId, data.spaceId),
                ),
                visibilityFilter(context.session),
            ),
            orderBy: (types, { asc }) => [asc(types.name)],
        });
    });

const createSchema = z.object({
    slug: z.string().min(1).max(100).regex(slugPattern, {
        message:
            "Slug must contain only lowercase letters, numbers, and hyphens",
    }),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    color: z.string().max(20).optional(),
    isInternal: z.boolean().default(false),
    defaultDurationMinutes: z.number().int().min(1).max(1440).optional(),
    // If set, limits event type to this space; if null/undefined, it's global
    spaceId: z.string().uuid().optional(),
});

export const create = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(createSchema)
    .handler(async ({ data, context }) => {
        if (data.spaceId) {
            // Space-specific event type: check permission for that space
            const spaceRecord = await context.db.query.space.findFirst({
                where: eq(space.id, data.spaceId),
            });
            if (!spaceRecord) throw notFound("Space not found");
            assertCan(context.actor, "manage:event-types", {
                spaceSlug: spaceRecord.slug,
            });
        } else {
            // Global event type: requires admin or global permission
            assertCan(context.actor, "manage:event-types");
        }

        const [result] = await context.db
            .insert(eventType)
            .values({
                ...data,
                spaceId: data.spaceId ?? null,
            })
            .returning();
        return result ?? null;
    });

const updateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    color: z.string().max(20).optional(),
    isInternal: z.boolean().optional(),
    defaultDurationMinutes: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .nullable()
        .optional(),
});

export const update = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(updateSchema)
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.eventType.findFirst({
            where: eq(eventType.id, data.id),
            with: { space: true },
        });
        if (!existing) throw notFound("Event type not found");
        assertCan(context.actor, "manage:event-types", {
            eventTypeSlug: existing.slug,
            spaceSlug: existing.space?.slug,
        });

        const { id, ...updates } = data;
        const [result] = await context.db
            .update(eventType)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(eventType.id, id))
            .returning();
        return result ?? null;
    });

// `delete` is a reserved word, hence deleteEventType
/**
 * What deleting an event type takes with it: events (with their overrides)
 * cascade, listed per space so the confirmation can show where they are.
 */
export const getDeleteImpact = createServerFn({ method: "GET" })
    .middleware([authed])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.eventType.findFirst({
            where: eq(eventType.id, data.id),
            with: { space: true },
        });
        if (!existing) throw notFound("Event type not found");
        assertCan(context.actor, "manage:event-types", {
            eventTypeSlug: existing.slug,
            spaceSlug: existing.space?.slug,
        });

        const spaces = await eventImpactBySpace(eq(event.eventTypeId, data.id));
        return { ...sumImpact(spaces), spaces };
    });

// Deleting an event type deletes every event using it (cascade)
export const deleteEventType = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.eventType.findFirst({
            where: eq(eventType.id, data.id),
            with: { space: true },
        });
        if (!existing) throw notFound("Event type not found");
        assertCan(context.actor, "manage:event-types", {
            eventTypeSlug: existing.slug,
            spaceSlug: existing.space?.slug,
        });

        await context.db.delete(eventType).where(eq(eventType.id, data.id));
        return { success: true };
    });
