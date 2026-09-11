import { createServerFn } from "@tanstack/react-start";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { authed, withActor } from "@/server/auth-middleware";
import type { db } from "@/server/db";
import { event, eventType, space } from "@/server/db/schema";
import { eventImpactBySpace, sumImpact } from "@/server/event-impact";
import { notFound } from "@/server/fn-errors";
import { assertCan } from "@/server/permissions";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
const slugPattern = /^[a-z0-9-]+$/;

const listSchema = z
    .object({
        includePrivate: z.boolean().optional().default(false),
    })
    .optional();

export const list = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(listSchema)
    .handler(async ({ data, context }) => {
        const includePrivate = data?.includePrivate && context.session?.user;

        if (includePrivate) {
            return context.db.query.space.findMany({
                orderBy: (spaces, { asc }) => [asc(spaces.name)],
            });
        }

        return context.db.query.space.findMany({
            where: eq(space.isPublic, true),
            orderBy: (spaces, { asc }) => [asc(spaces.name)],
        });
    });

export const getBySlug = createServerFn({ method: "GET" })
    .middleware([withActor])
    .validator(z.object({ slug: z.string() }))
    .handler(async ({ data, context }) => {
        const result = await context.db.query.space.findFirst({
            where: eq(space.slug, data.slug),
            with: {
                // Internal event types are only visible to signed-in users
                eventTypes: context.session?.user
                    ? true
                    : { where: eq(eventType.isInternal, false) },
            },
        });

        // Check access for private spaces
        if (result && !result.isPublic && !context.session?.user) {
            return null;
        }

        return result ?? null;
    });

const createSchema = z.object({
    slug: z.string().min(1).max(100).regex(slugPattern, {
        message:
            "Slug must contain only lowercase letters, numbers, and hyphens",
    }),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isPublic: z.boolean().default(true),
    isDefault: z.boolean().default(false),
});

export const create = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(createSchema)
    .handler(async ({ data, context }) => {
        // Creating a space requires admin or global permission (no scope)
        assertCan(context.actor, "manage:spaces");

        return context.db.transaction(async (tx) => {
            if (data.isDefault) await clearDefaultSpace(tx);
            const [result] = await tx.insert(space).values(data).returning();
            return result ?? null;
        });
    });

const updateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
    isDefault: z.boolean().optional(),
});

/** Only one space can be the default: unset it everywhere before setting it */
async function clearDefaultSpace(tx: Pick<typeof db, "update">) {
    await tx
        .update(space)
        .set({ isDefault: false })
        .where(eq(space.isDefault, true));
}

export const update = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(updateSchema)
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.space.findFirst({
            where: eq(space.id, data.id),
        });
        if (!existing) throw notFound("Space not found");
        assertCan(context.actor, "manage:spaces", { spaceSlug: existing.slug });
        // Which space is the default affects the whole site, not just this space
        if (
            data.isDefault !== undefined &&
            data.isDefault !== existing.isDefault
        ) {
            assertCan(context.actor, "manage:spaces");
        }

        const { id, ...updates } = data;
        return context.db.transaction(async (tx) => {
            if (updates.isDefault) await clearDefaultSpace(tx);
            const [result] = await tx
                .update(space)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(space.id, id))
                .returning();
            return result ?? null;
        });
    });

/**
 * What deleting a space takes with it (events with their overrides cascade,
 * space-specific event types cascade). Shown in the delete confirmation so
 * the numbers the user has to type back are the real ones.
 */
export const getDeleteImpact = createServerFn({ method: "GET" })
    .middleware([authed])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.space.findFirst({
            where: eq(space.id, data.id),
        });
        if (!existing) throw notFound("Space not found");
        assertCan(context.actor, "manage:spaces", { spaceSlug: existing.slug });

        const impact = sumImpact(
            await eventImpactBySpace(eq(event.spaceId, data.id)),
        );
        const [eventTypes] = await context.db
            .select({ n: count() })
            .from(eventType)
            .where(eq(eventType.spaceId, data.id));
        return { ...impact, eventTypes: eventTypes?.n ?? 0 };
    });

// `delete` is a reserved word, hence deleteSpace
export const deleteSpace = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.space.findFirst({
            where: eq(space.id, data.id),
        });
        if (!existing) throw notFound("Space not found");
        assertCan(context.actor, "manage:spaces", { spaceSlug: existing.slug });

        await context.db.delete(space).where(eq(space.id, data.id));
        return { success: true };
    });
