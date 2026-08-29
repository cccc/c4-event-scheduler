import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { authed, withActor } from "@/server/auth-middleware";
import { eventType, space } from "@/server/db/schema";
import { notFound } from "@/server/fn-errors";
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

export const list = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(listSchema)
    .handler(async ({ data, context }) => {
        const visible = visibilityFilter(context.session);

        if (data?.globalOnly) {
            return context.db.query.eventType.findMany({
                where: and(isNull(eventType.spaceId), visible),
                with: { space: true },
                orderBy: (types, { asc }) => [asc(types.name)],
            });
        }

        if (data?.spaceId) {
            // Return global event types + event types specific to this space
            return context.db.query.eventType.findMany({
                where: and(
                    or(
                        isNull(eventType.spaceId),
                        eq(eventType.spaceId, data.spaceId),
                    ),
                    visible,
                ),
                with: { space: true },
                orderBy: (types, { asc }) => [asc(types.name)],
            });
        }

        return context.db.query.eventType.findMany({
            where: visible,
            with: { space: true },
            orderBy: (types, { asc }) => [asc(types.name)],
        });
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
