import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { generateApiKey } from "@/server/api-key-auth";
import { actor, apiKey, permission } from "@/server/db/schema";

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

export const apiKeysRouter = createTRPCRouter({
    // List all API keys with their permissions (no keyHash exposed)
    list: adminProcedure.query(async ({ ctx }) => {
        const keys = await ctx.db.query.apiKey.findMany({
            with: {
                actor: { with: { permissions: true } },
            },
            orderBy: (k, { desc }) => [desc(k.createdAt)],
        });
        // Replace keyHash with a short fingerprint (first 8 hex chars of the hash).
        // Safe to expose: derived from the hash, not the key material itself.
        return keys.map(({ keyHash, actor: a, ...rest }) => ({
            ...rest,
            isAdmin: a?.isAdmin ?? false,
            keyFingerprint: keyHash.slice(0, 8),
            permissions: a?.permissions ?? [],
        }));
    }),

    // Create a new API key — returns the full rawKey exactly once
    create: adminProcedure
        .input(
            z.object({
                name: z.string().min(1).max(255),
                isAdmin: z.boolean().default(false),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { rawKey, keyHash } = generateApiKey();

            const [keyResult] = await ctx.db
                .insert(apiKey)
                .values({
                    name: input.name,
                    keyHash,
                    isActive: true,
                })
                .returning();

            if (!keyResult)
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

            // Create the corresponding actor for this API key (with isAdmin)
            await ctx.db.insert(actor).values({
                kind: "apiKey",
                apiKeyId: keyResult.id,
                isAdmin: input.isAdmin,
            });

            // Return rawKey to the caller — this is the only time it will be shown
            return { ...keyResult, rawKey };
        }),

    // Update name / isAdmin / isActive
    update: adminProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                name: z.string().min(1).max(255).optional(),
                isAdmin: z.boolean().optional(),
                isActive: z.boolean().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { id, isAdmin: isAdminUpdate, ...keyUpdates } = input;

            // Verify the key exists
            const existing = await ctx.db.query.apiKey.findFirst({
                where: eq(apiKey.id, id),
            });
            if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

            if (Object.keys(keyUpdates).length > 0) {
                await ctx.db
                    .update(apiKey)
                    .set(keyUpdates)
                    .where(eq(apiKey.id, id));
            }

            if (isAdminUpdate !== undefined) {
                await ctx.db
                    .update(actor)
                    .set({ isAdmin: isAdminUpdate })
                    .where(eq(actor.apiKeyId, id));
            }

            const { keyHash: _hash, ...rest } = { ...existing, ...keyUpdates };
            return rest;
        }),

    // Hard delete (cascades to actor and permissions)
    delete: adminProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(apiKey).where(eq(apiKey.id, input.id));
            return { success: true };
        }),

    // Add a permission to an API key
    addPermission: adminProcedure
        .input(
            z.object({
                apiKeyId: z.string().uuid(),
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
                where: eq(actor.apiKeyId, input.apiKeyId),
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
});
