import { TRPCError } from "@trpc/server";
import { eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "@/server/api/trpc";
import { eventType, space } from "@/server/db/schema";
import { assertCan } from "@/server/permissions";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
const slugPattern = /^[a-z0-9-]+$/;

export const eventTypesRouter = createTRPCRouter({
    list: publicProcedure
        .input(
            z
                .object({
                    // Filter to only global event types (spaceId is null)
                    globalOnly: z.boolean().optional().default(false),
                    // Filter to event types available in a specific space (global + space-specific)
                    spaceId: z.string().uuid().optional(),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            if (input?.globalOnly) {
                return ctx.db.query.eventType.findMany({
                    where: isNull(eventType.spaceId),
                    with: { space: true },
                    orderBy: (types, { asc }) => [asc(types.name)],
                });
            }

            if (input?.spaceId) {
                // Return global event types + event types specific to this space
                return ctx.db.query.eventType.findMany({
                    where: or(
                        isNull(eventType.spaceId),
                        eq(eventType.spaceId, input.spaceId),
                    ),
                    with: { space: true },
                    orderBy: (types, { asc }) => [asc(types.name)],
                });
            }

            return ctx.db.query.eventType.findMany({
                with: { space: true },
                orderBy: (types, { asc }) => [asc(types.name)],
            });
        }),

    getBySlug: publicProcedure
        .input(z.object({ slug: z.string() }))
        .query(async ({ ctx, input }) => {
            return ctx.db.query.eventType.findFirst({
                where: eq(eventType.slug, input.slug),
            });
        }),

    getBySpace: publicProcedure
        .input(z.object({ spaceId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Return global event types + event types specific to this space
            return ctx.db.query.eventType.findMany({
                where: or(
                    isNull(eventType.spaceId),
                    eq(eventType.spaceId, input.spaceId),
                ),
                orderBy: (types, { asc }) => [asc(types.name)],
            });
        }),

    create: protectedProcedure
        .input(
            z.object({
                slug: z.string().min(1).max(100).regex(slugPattern, {
                    message:
                        "Slug must contain only lowercase letters, numbers, and hyphens",
                }),
                name: z.string().min(1).max(255),
                description: z.string().optional(),
                color: z.string().max(20).optional(),
                isInternal: z.boolean().default(false),
                defaultDurationMinutes: z
                    .number()
                    .int()
                    .min(1)
                    .max(1440)
                    .optional(),
                // If set, limits event type to this space; if null/undefined, it's global
                spaceId: z.string().uuid().optional(),
            }),
        )
        .use(async ({ ctx, input, next }) => {
            if (input.spaceId) {
                // Space-specific event type: check permission for that space
                const spaceRecord = await ctx.db.query.space.findFirst({
                    where: eq(space.id, input.spaceId),
                });
                if (!spaceRecord)
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Space not found",
                    });
                assertCan(ctx.actor, "manage:event-types", {
                    spaceSlug: spaceRecord.slug,
                });
            } else {
                // Global event type: requires admin or global permission
                assertCan(ctx.actor, "manage:event-types");
            }
            return next();
        })
        .mutation(async ({ ctx, input }) => {
            const [result] = await ctx.db
                .insert(eventType)
                .values({
                    ...input,
                    spaceId: input.spaceId ?? null,
                })
                .returning();
            return result;
        }),

    update: protectedProcedure
        .input(
            z.object({
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
            }),
        )
        .use(async ({ ctx, input, next }) => {
            const existing = await ctx.db.query.eventType.findFirst({
                where: eq(eventType.id, input.id),
                with: { space: true },
            });
            if (!existing)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Event type not found",
                });
            assertCan(ctx.actor, "manage:event-types", {
                eventTypeSlug: existing.slug,
                spaceSlug: existing.space?.slug,
            });
            return next({ ctx: { existing } });
        })
        .mutation(async ({ ctx, input }) => {
            const { id, ...updates } = input;
            const [result] = await ctx.db
                .update(eventType)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(eventType.id, id))
                .returning();
            return result;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .use(async ({ ctx, input, next }) => {
            const existing = await ctx.db.query.eventType.findFirst({
                where: eq(eventType.id, input.id),
                with: { space: true },
            });
            if (!existing)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Event type not found",
                });
            assertCan(ctx.actor, "manage:event-types", {
                eventTypeSlug: existing.slug,
                spaceSlug: existing.space?.slug,
            });
            return next({ ctx: { existing } });
        })
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(eventType).where(eq(eventType.id, input.id));
            return { success: true };
        }),
});
