import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "@/server/api/trpc";
import { space } from "@/server/db/schema";
import { assertCan } from "@/server/permissions";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
const slugPattern = /^[a-z0-9-]+$/;

export const spacesRouter = createTRPCRouter({
    list: publicProcedure
        .input(
            z
                .object({
                    includePrivate: z.boolean().optional().default(false),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const includePrivate = input?.includePrivate && ctx.session?.user;

            if (includePrivate) {
                return ctx.db.query.space.findMany({
                    orderBy: (spaces, { asc }) => [asc(spaces.name)],
                });
            }

            return ctx.db.query.space.findMany({
                where: eq(space.isPublic, true),
                orderBy: (spaces, { asc }) => [asc(spaces.name)],
            });
        }),

    getBySlug: publicProcedure
        .input(z.object({ slug: z.string() }))
        .query(async ({ ctx, input }) => {
            const result = await ctx.db.query.space.findFirst({
                where: eq(space.slug, input.slug),
                with: {
                    eventTypes: true,
                },
            });

            // Check access for private spaces
            if (result && !result.isPublic && !ctx.session?.user) {
                return null;
            }

            return result;
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
                isPublic: z.boolean().default(true),
            }),
        )
        .use(({ ctx, next }) => {
            // Creating a space requires admin or global permission (no scope)
            assertCan(ctx.actor, "manage:spaces");
            return next();
        })
        .mutation(async ({ ctx, input }) => {
            const [result] = await ctx.db
                .insert(space)
                .values(input)
                .returning();
            return result;
        }),

    update: protectedProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                description: z.string().optional(),
                isPublic: z.boolean().optional(),
            }),
        )
        .use(async ({ ctx, input, next }) => {
            const existing = await ctx.db.query.space.findFirst({
                where: eq(space.id, input.id),
            });
            if (!existing)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Space not found",
                });
            assertCan(ctx.actor, "manage:spaces", { spaceSlug: existing.slug });
            return next({ ctx: { existing } });
        })
        .mutation(async ({ ctx, input }) => {
            const { id, ...updates } = input;
            const [result] = await ctx.db
                .update(space)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(space.id, id))
                .returning();
            return result;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .use(async ({ ctx, input, next }) => {
            const existing = await ctx.db.query.space.findFirst({
                where: eq(space.id, input.id),
            });
            if (!existing)
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Space not found",
                });
            assertCan(ctx.actor, "manage:spaces", { spaceSlug: existing.slug });
            return next({ ctx: { existing } });
        })
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(space).where(eq(space.id, input.id));
            return { success: true };
        }),
});
