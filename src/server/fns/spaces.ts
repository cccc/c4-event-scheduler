import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { authed, withActor } from "@/server/auth-middleware";
import { eventType, space } from "@/server/db/schema";
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
});

export const create = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(createSchema)
    .handler(async ({ data, context }) => {
        // Creating a space requires admin or global permission (no scope)
        assertCan(context.actor, "manage:spaces");

        const [result] = await context.db
            .insert(space)
            .values(data)
            .returning();
        return result ?? null;
    });

const updateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
});

export const update = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(updateSchema)
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.space.findFirst({
            where: eq(space.id, data.id),
        });
        if (!existing) throw notFound("Space not found");
        assertCan(context.actor, "manage:spaces", { spaceSlug: existing.slug });

        const { id, ...updates } = data;
        const [result] = await context.db
            .update(space)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(space.id, id))
            .returning();
        return result ?? null;
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
