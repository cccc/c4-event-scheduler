import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { generateApiKey } from "@/server/api-key-auth";
import { apiKey, apiKeyPermission, user } from "@/server/db/schema";

const slugPattern = /^[a-z0-9-]+$/;

// Admin guard middleware - verifies user has isAdmin: true
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const dbUser = await ctx.db.query.user.findFirst({
		where: eq(user.id, ctx.session.user.id),
	});

	if (!dbUser?.isAdmin) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Access denied. Admin privileges required.",
		});
	}

	return next({ ctx: { ...ctx, user: dbUser } });
});

export const apiKeysRouter = createTRPCRouter({
	// List all API keys with their permissions (no keyHash exposed)
	list: adminProcedure.query(async ({ ctx }) => {
		const keys = await ctx.db.query.apiKey.findMany({
			with: { permissions: true },
			orderBy: (k, { desc }) => [desc(k.createdAt)],
		});
		// Replace keyHash with a short fingerprint (first 8 hex chars of the hash).
		// Safe to expose: derived from the hash, not the key material itself.
		return keys.map(({ keyHash, ...rest }) => ({
			...rest,
			keyFingerprint: keyHash.slice(0, 8),
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

			const [result] = await ctx.db
				.insert(apiKey)
				.values({
					name: input.name,
					keyHash,
					isAdmin: input.isAdmin,
					isActive: true,
				})
				.returning();

			if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

			// Return rawKey to the caller — this is the only time it will be shown
			return { ...result, rawKey };
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
			const { id, ...updates } = input;
			const [result] = await ctx.db
				.update(apiKey)
				.set(updates)
				.where(eq(apiKey.id, id))
				.returning();

			if (!result) throw new TRPCError({ code: "NOT_FOUND" });
			const { keyHash: _hash, ...rest } = result;
			return rest;
		}),

	// Hard delete (cascades permissions)
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
			const [result] = await ctx.db
				.insert(apiKeyPermission)
				.values({
					apiKeyId: input.apiKeyId,
					spaceSlug: input.spaceSlug ?? null,
					eventTypeSlug: input.eventTypeSlug ?? null,
				})
				.returning();
			return result;
		}),

	// Remove a permission
	removePermission: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(apiKeyPermission)
				.where(eq(apiKeyPermission.id, input.id));
			return { success: true };
		}),
});
