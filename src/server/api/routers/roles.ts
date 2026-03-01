import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "@/server/api/trpc";
import { actor, permission } from "@/server/db/schema";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
const slugPattern = /^[a-z0-9-]+$/;

// Admin guard middleware — uses ctx.actor.isAdmin already loaded by protectedProcedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.actor.isAdmin) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied. Admin privileges required.",
        });
    }
    return next();
});

export const rolesRouter = createTRPCRouter({
    // Check if current user is admin
    isAdmin: publicProcedure.query(async ({ ctx }) => {
        if (!ctx.session?.user) return false;
        const actorRecord = await ctx.db.query.actor.findFirst({
            where: eq(actor.userId, ctx.session.user.id),
        });
        return actorRecord?.isAdmin ?? false;
    }),

    // List all users with their permissions (via actor)
    listUsers: adminProcedure.query(async ({ ctx }) => {
        const users = await ctx.db.query.user.findMany({
            orderBy: (users, { asc }) => [asc(users.name)],
        });

        // Load all actor rows that belong to users, with their permissions
        const actors = await ctx.db.query.actor.findMany({
            where: eq(actor.kind, "user"),
            with: { permissions: true },
        });

        // Build map: userId → { isAdmin, permissions }
        const actorByUser = new Map<
            string,
            {
                isAdmin: boolean;
                permissions: Array<{
                    id: string;
                    spaceSlug: string | null;
                    eventTypeSlug: string | null;
                    source: "oidc" | "manual";
                    actorId: string;
                }>;
            }
        >();

        for (const a of actors) {
            if (!a.userId) continue;
            actorByUser.set(a.userId, {
                isAdmin: a.isAdmin,
                permissions: a.permissions.map((p) => ({
                    id: p.id,
                    spaceSlug: p.spaceSlug,
                    eventTypeSlug: p.eventTypeSlug,
                    source: p.source,
                    actorId: p.actorId,
                })),
            });
        }

        return users.map((u) => ({
            ...u,
            isAdmin: actorByUser.get(u.id)?.isAdmin ?? false,
            permissions: actorByUser.get(u.id)?.permissions ?? [],
        }));
    }),

    // Get permissions for a specific user
    getUserPermissions: adminProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ ctx, input }) => {
            const actorRecord = await ctx.db.query.actor.findFirst({
                where: eq(actor.userId, input.userId),
                with: {
                    permissions: {
                        orderBy: (p, { asc }) => [
                            asc(p.spaceSlug),
                            asc(p.eventTypeSlug),
                        ],
                    },
                },
            });

            return {
                isAdmin: actorRecord?.isAdmin ?? false,
                permissions: actorRecord?.permissions ?? [],
            };
        }),

    // Add a permission to a user (manual assignment)
    addPermission: adminProcedure
        .input(
            z.object({
                userId: z.string(),
                spaceSlug: z
                    .string()
                    .regex(slugPattern, {
                        message:
                            "Slug must contain only lowercase letters, numbers, and hyphens",
                    })
                    .nullable()
                    .optional(),
                eventTypeSlug: z
                    .string()
                    .regex(slugPattern, {
                        message:
                            "Slug must contain only lowercase letters, numbers, and hyphens",
                    })
                    .nullable()
                    .optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const actorRecord = await ctx.db.query.actor.findFirst({
                where: eq(actor.userId, input.userId),
            });
            if (!actorRecord) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Actor not found",
                });
            }

            const [result] = await ctx.db
                .insert(permission)
                .values({
                    actorId: actorRecord.id,
                    spaceSlug: input.spaceSlug ?? null,
                    eventTypeSlug: input.eventTypeSlug ?? null,
                    source: "manual",
                })
                .returning();
            return result;
        }),

    // Remove a permission
    removePermission: adminProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(permission).where(eq(permission.id, input.id));
            return { success: true };
        }),

    // Set user admin status
    setAdmin: adminProcedure
        .input(
            z.object({
                userId: z.string(),
                isAdmin: z.boolean(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            // Prevent removing own admin status
            if (input.userId === ctx.session.user.id && !input.isAdmin) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You cannot remove your own admin status",
                });
            }

            await ctx.db
                .update(actor)
                .set({ isAdmin: input.isAdmin })
                .where(eq(actor.userId, input.userId));

            return { success: true };
        }),

    // List all spaces (for scope selection)
    listSpaces: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.query.space.findMany({
            orderBy: (spaces, { asc }) => [asc(spaces.name)],
        });
    }),

    // List all event types (for scope selection)
    listEventTypes: adminProcedure.query(async ({ ctx }) => {
        return ctx.db.query.eventType.findMany({
            orderBy: (types, { asc }) => [asc(types.name)],
        });
    }),
});
