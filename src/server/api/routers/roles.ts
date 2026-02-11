import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { user, userPermission } from "@/server/db/schema";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
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

	return next({
		ctx: {
			...ctx,
			user: dbUser,
		},
	});
});

export const rolesRouter = createTRPCRouter({
	// Check if current user is admin
	isAdmin: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.session?.user) {
			return false;
		}
		const dbUser = await ctx.db.query.user.findFirst({
			where: eq(user.id, ctx.session.user.id),
		});
		return dbUser?.isAdmin ?? false;
	}),

	// List all users with their permissions
	listUsers: adminProcedure.query(async ({ ctx }) => {
		const users = await ctx.db.query.user.findMany({
			orderBy: (users, { asc }) => [asc(users.name)],
		});

		const permissions = await ctx.db.query.userPermission.findMany();

		// Group permissions by user
		const permsByUser = new Map<
			string,
			Array<{
				id: string;
				spaceSlug: string | null;
				eventTypeSlug: string | null;
				source: "oidc" | "manual";
			}>
		>();

		for (const p of permissions) {
			const existing = permsByUser.get(p.userId) ?? [];
			existing.push({
				id: p.id,
				spaceSlug: p.spaceSlug,
				eventTypeSlug: p.eventTypeSlug,
				source: p.source,
			});
			permsByUser.set(p.userId, existing);
		}

		return users.map((u) => ({
			...u,
			permissions: permsByUser.get(u.id) ?? [],
		}));
	}),

	// Get permissions for a specific user
	getUserPermissions: adminProcedure
		.input(z.object({ userId: z.string() }))
		.query(async ({ ctx, input }) => {
			const dbUser = await ctx.db.query.user.findFirst({
				where: eq(user.id, input.userId),
			});

			const permissions = await ctx.db.query.userPermission.findMany({
				where: eq(userPermission.userId, input.userId),
				orderBy: (p, { asc }) => [asc(p.spaceSlug), asc(p.eventTypeSlug)],
			});

			return {
				isAdmin: dbUser?.isAdmin ?? false,
				permissions,
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
			const [result] = await ctx.db
				.insert(userPermission)
				.values({
					userId: input.userId,
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
			await ctx.db
				.delete(userPermission)
				.where(eq(userPermission.id, input.id));
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

			const [result] = await ctx.db
				.update(user)
				.set({ isAdmin: input.isAdmin, updatedAt: new Date() })
				.where(eq(user.id, input.userId))
				.returning();

			return result;
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
