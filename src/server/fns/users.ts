import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authLog } from "@/server/auth-log";
import { admin } from "@/server/auth-middleware";
import { auth } from "@/server/better-auth";
import { account, actor, permission, user } from "@/server/db/schema";
import { badRequest, notFound } from "@/server/fn-errors";

// Slug pattern: lowercase alphanumeric and hyphens, no colons or slashes
const slugPattern = /^[a-z0-9-]+$/;

// Issuer namespace better-auth (>= 1.7) uses for email/password accounts;
// mirrors createLocalAccountIssuer("credential") and migration 0005.
const CREDENTIAL_ISSUER = "local:credential";

// Matches better-auth's default minPasswordLength
const passwordSchema = z.string().min(8).max(128);

// List all users with their sign-in methods and permissions (via actor)
export const listUsers = createServerFn({ method: "GET" })
    .middleware([admin])
    .handler(async ({ context }) => {
        const users = await context.db.query.user.findMany({
            orderBy: (users, { asc }) => [asc(users.name)],
        });

        // Load all actor rows that belong to users, with their permissions
        const actors = await context.db.query.actor.findMany({
            where: eq(actor.kind, "user"),
            with: { permissions: true },
        });

        // Which providers each user can sign in with ("credential" = local
        // email/password account, "oidc" = SSO)
        const accounts = await context.db.query.account.findMany({
            columns: { userId: true, providerId: true },
        });
        const providersByUser = new Map<string, string[]>();
        for (const a of accounts) {
            providersByUser.set(a.userId, [
                ...(providersByUser.get(a.userId) ?? []),
                a.providerId,
            ]);
        }

        // Build map: userId -> { isAdmin, permissions }
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

        return users.map((u) => {
            const providers = providersByUser.get(u.id) ?? [];
            return {
                ...u,
                providers,
                hasPassword: providers.includes("credential"),
                isAdmin: actorByUser.get(u.id)?.isAdmin ?? false,
                permissions: actorByUser.get(u.id)?.permissions ?? [],
            };
        });
    });

// Get permissions for a specific user
export const getUserPermissions = createServerFn({ method: "GET" })
    .middleware([admin])
    .validator(z.object({ userId: z.string() }))
    .handler(async ({ data, context }) => {
        const actorRecord = await context.db.query.actor.findFirst({
            where: eq(actor.userId, data.userId),
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
    });

// ─── Local (email/password) accounts ────────────────────────────────────────

const createLocalUserSchema = z.object({
    name: z.string().trim().min(1).max(255),
    email: z.email().max(255),
    password: passwordSchema,
    isAdmin: z.boolean().default(false),
});

/**
 * Create a user that signs in with email + password. Public sign-up is
 * disabled, so this is the only way local accounts come into existence.
 * Uses better-auth's internal adapter so its database hooks run (which is
 * what creates the actor row) and the password hash matches what sign-in
 * expects.
 */
export const createLocalUser = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(createLocalUserSchema)
    .handler(async ({ data, context }) => {
        const email = data.email.toLowerCase();
        const existing = await context.db.query.user.findFirst({
            where: eq(user.email, email),
            columns: { id: true },
        });
        if (existing) throw badRequest("A user with this email already exists");

        const ctx = await auth.$context;
        const created = await ctx.internalAdapter.createUser(
            { name: data.name, email, emailVerified: true },
            // Provisioning source for better-auth's validateUserInfo hook
            { method: "admin" },
        );
        await ctx.internalAdapter.linkAccount({
            userId: created.id,
            providerId: "credential",
            issuer: CREDENTIAL_ISSUER,
            accountId: created.id,
            password: await ctx.password.hash(data.password),
        });

        if (data.isAdmin) {
            await context.db
                .update(actor)
                .set({ isAdmin: true })
                .where(eq(actor.userId, created.id));
        }

        authLog.info("local user created", {
            userId: created.id,
            email,
            isAdmin: data.isAdmin,
            byUserId: context.user.id,
        });

        return { id: created.id, name: created.name, email: created.email };
    });

const updateUserSchema = z.object({
    userId: z.string(),
    name: z.string().trim().min(1).max(255).optional(),
    email: z.email().max(255).optional(),
});

// Edit a user's name / email
export const updateUser = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(updateUserSchema)
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.user.findFirst({
            where: eq(user.id, data.userId),
        });
        if (!existing) throw notFound("User not found");

        const email = data.email?.toLowerCase();
        if (email && email !== existing.email) {
            const taken = await context.db.query.user.findFirst({
                where: eq(user.email, email),
                columns: { id: true },
            });
            if (taken)
                throw badRequest("A user with this email already exists");
        }

        const [result] = await context.db
            .update(user)
            .set({
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(email !== undefined ? { email } : {}),
                updatedAt: new Date(),
            })
            .where(eq(user.id, data.userId))
            .returning();
        return result ?? null;
    });

const setUserPasswordSchema = z.object({
    userId: z.string(),
    password: passwordSchema,
});

/**
 * Set (or reset) a user's local password and revoke their sessions. Creates
 * the credential account if the user only had SSO so far.
 */
export const setUserPassword = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(setUserPasswordSchema)
    .handler(async ({ data, context }) => {
        const existing = await context.db.query.user.findFirst({
            where: eq(user.id, data.userId),
            columns: { id: true },
        });
        if (!existing) throw notFound("User not found");

        const ctx = await auth.$context;
        const hashed = await ctx.password.hash(data.password);
        const hasCredential = await context.db.query.account
            .findMany({
                where: eq(account.userId, data.userId),
                columns: { providerId: true },
            })
            .then((rows) => rows.some((r) => r.providerId === "credential"));

        if (hasCredential) {
            await ctx.internalAdapter.updatePassword(data.userId, hashed);
        } else {
            await ctx.internalAdapter.linkAccount({
                userId: data.userId,
                providerId: "credential",
                issuer: CREDENTIAL_ISSUER,
                accountId: data.userId,
                password: hashed,
            });
        }

        // Anyone holding the old password's sessions is signed out, except the
        // admin resetting their own password.
        if (data.userId !== context.user.id) {
            await ctx.internalAdapter.deleteUserSessions(data.userId);
        }

        authLog.info("user password set by admin", {
            userId: data.userId,
            byUserId: context.user.id,
        });

        return { success: true };
    });

// Delete a user (sessions, accounts, actor and permissions cascade)
export const deleteUser = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(z.object({ userId: z.string() }))
    .handler(async ({ data, context }) => {
        if (data.userId === context.user.id) {
            throw badRequest("You cannot delete your own account");
        }
        const existing = await context.db.query.user.findFirst({
            where: eq(user.id, data.userId),
            columns: { id: true, email: true },
        });
        if (!existing) throw notFound("User not found");

        const ctx = await auth.$context;
        await ctx.internalAdapter.deleteUser(data.userId);

        authLog.info("user deleted", {
            userId: data.userId,
            email: existing.email,
            byUserId: context.user.id,
        });

        return { success: true };
    });

// ─── Permissions ────────────────────────────────────────────────────────────

const addPermissionSchema = z.object({
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
});

// Add a permission to a user (manual assignment)
export const addPermission = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(addPermissionSchema)
    .handler(async ({ data, context }) => {
        const actorRecord = await context.db.query.actor.findFirst({
            where: eq(actor.userId, data.userId),
        });
        if (!actorRecord) {
            throw notFound("Actor not found");
        }

        const [result] = await context.db
            .insert(permission)
            .values({
                actorId: actorRecord.id,
                spaceSlug: data.spaceSlug ?? null,
                eventTypeSlug: data.eventTypeSlug ?? null,
                source: "manual",
            })
            .returning();
        return result ?? null;
    });

// Remove a permission
export const removePermission = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        await context.db.delete(permission).where(eq(permission.id, data.id));
        return { success: true };
    });

const setAdminSchema = z.object({
    userId: z.string(),
    isAdmin: z.boolean(),
});

// Set user admin status
export const setAdmin = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(setAdminSchema)
    .handler(async ({ data, context }) => {
        // Prevent removing own admin status
        if (data.userId === context.session.user.id && !data.isAdmin) {
            throw badRequest("You cannot remove your own admin status");
        }

        await context.db
            .update(actor)
            .set({ isAdmin: data.isAdmin })
            .where(eq(actor.userId, data.userId));

        return { success: true };
    });

// List all spaces (for scope selection)
export const listSpaces = createServerFn({ method: "GET" })
    .middleware([admin])
    .handler(async ({ context }) => {
        return context.db.query.space.findMany({
            orderBy: (spaces, { asc }) => [asc(spaces.name)],
        });
    });

// List all event types (for scope selection)
export const listEventTypes = createServerFn({ method: "GET" })
    .middleware([admin])
    .handler(async ({ context }) => {
        return context.db.query.eventType.findMany({
            orderBy: (types, { asc }) => [asc(types.name)],
        });
    });
