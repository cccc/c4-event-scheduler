import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { space } from "@/server/db/schema";
import { canManageSpaces, hasPermission } from "@/server/permissions";

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
		.mutation(async ({ ctx, input }) => {
			// Check permission: requires admin or global permission
			const canCreate = await canManageSpaces(ctx.session.user.id);
			if (!canCreate) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You don't have permission to create spaces",
				});
			}

			const [result] = await ctx.db.insert(space).values(input).returning();
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
		.mutation(async ({ ctx, input }) => {
			// Get the space to check permission
			const existing = await ctx.db.query.space.findFirst({
				where: eq(space.id, input.id),
			});
			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Space not found" });
			}

			// Check permission for this space
			const canUpdate = await hasPermission(ctx.session.user.id, {
				spaceSlug: existing.slug,
			});
			if (!canUpdate) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You don't have permission to update this space",
				});
			}

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
		.mutation(async ({ ctx, input }) => {
			// Get the space to check permission
			const existing = await ctx.db.query.space.findFirst({
				where: eq(space.id, input.id),
			});
			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Space not found" });
			}

			// Check permission for this space
			const canDelete = await hasPermission(ctx.session.user.id, {
				spaceSlug: existing.slug,
			});
			if (!canDelete) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You don't have permission to delete this space",
				});
			}

			await ctx.db.delete(space).where(eq(space.id, input.id));
			return { success: true };
		}),
});
