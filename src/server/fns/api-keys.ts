import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { type Capabilities, capabilitiesGrant } from "@/lib/permissions-core";
import { generateApiKey } from "@/server/api-key-auth";
import { authLog } from "@/server/auth-log";
import { admin, authed } from "@/server/auth-middleware";
import { db } from "@/server/db";
import { actor, apiKey, apiKeySecret, permission } from "@/server/db/schema";
import { badRequest, forbidden, notFound } from "@/server/fn-errors";
import { actorFromUserId } from "@/server/permissions";

const slugPattern = /^[a-z0-9-]+$/;
const slugSchema = z.string().regex(slugPattern, {
    message: "Slug must contain only lowercase letters, numbers, and hyphens",
});

type KeyRow = {
    fingerprint: string;
    userId: string | null;
    actor: {
        id: string;
        isAdmin: boolean;
        permissions: Array<{
            id: string;
            spaceSlug: string | null;
            eventTypeSlug: string | null;
        }>;
    } | null;
    user?: { id: string; name: string; email: string } | null;
    [key: string]: unknown;
};

const keyWith = {
    actor: { with: { permissions: true } },
    user: { columns: { id: true, name: true, email: true } },
} as const;

// Owner capabilities for a set of keys (one lookup per distinct owner).
// They bound what a personal key may be granted.
async function ownerCapabilities(
    keys: KeyRow[],
): Promise<Map<string, Capabilities>> {
    const caps = new Map<string, Capabilities>();
    for (const key of keys) {
        if (!key.userId || caps.has(key.userId)) continue;
        const owner = await actorFromUserId(key.userId);
        caps.set(key.userId, {
            isAdmin: owner.isAdmin,
            permissions: owner.permissions,
        });
    }
    return caps;
}

// Public view of a key: actor flattened, owner with capabilities
function toPublicKey<T extends KeyRow>(
    { actor: a, user, userId, fingerprint, ...rest }: T,
    caps: Map<string, Capabilities>,
) {
    return {
        ...rest,
        userId,
        fingerprint,
        isAdmin: a?.isAdmin ?? false,
        keyFingerprint: fingerprint,
        permissions: a?.permissions ?? [],
        owner:
            user && userId
                ? {
                      id: user.id,
                      name: user.name,
                      email: user.email,
                      capabilities: caps.get(userId) ?? {
                          isAdmin: false,
                          permissions: [],
                      },
                  }
                : null,
    };
}

async function publicKeys<T extends KeyRow>(keys: T[]) {
    const caps = await ownerCapabilities(keys);
    return keys.map((k) => toPublicKey(k, caps));
}

// ─── Listing ────────────────────────────────────────────────────────────────

// All keys: service keys and personal keys with their owner (admin only)
export const list = createServerFn({ method: "GET" })
    .middleware([admin])
    .handler(async ({ context }) => {
        const keys = await context.db.query.apiKey.findMany({
            with: keyWith,
            orderBy: (k, { desc }) => [desc(k.createdAt)],
        });
        return publicKeys(keys);
    });

// The signed-in user's own keys
export const listMine = createServerFn({ method: "GET" })
    .middleware([authed])
    .handler(async ({ context }) => {
        const keys = await context.db.query.apiKey.findMany({
            where: eq(apiKey.userId, context.user.id),
            with: keyWith,
            orderBy: (k, { desc }) => [desc(k.createdAt)],
        });
        return publicKeys(keys);
    });

// ─── Management (admins, or the owner of a personal key) ────────────────────

type ManageContext = {
    user: { id: string };
    actor: { isAdmin: boolean };
};

// Load a key and check the caller may manage it
async function loadManagedKey(context: ManageContext, id: string) {
    const key = await db.query.apiKey.findFirst({
        where: eq(apiKey.id, id),
        with: keyWith,
    });
    if (!key) throw notFound();
    if (!context.actor.isAdmin && key.userId !== context.user.id) {
        authLog.warn("api key management denied", {
            userId: context.user.id,
            apiKeyId: id,
        });
        throw forbidden();
    }
    return key;
}

// Personal keys can only be granted what their owner has
async function assertWithinOwner(
    userId: string | null,
    grant: { isAdmin?: boolean; scope?: PermissionScopeInput },
) {
    if (!userId) return;
    const owner = await actorFromUserId(userId);
    if (grant.isAdmin && !owner.isAdmin) {
        throw badRequest("The key owner is not an admin");
    }
    if (
        grant.scope &&
        !capabilitiesGrant(owner, {
            spaceSlug: grant.scope.spaceSlug ?? undefined,
            eventTypeSlug: grant.scope.eventTypeSlug ?? undefined,
        })
    ) {
        throw badRequest("This scope exceeds the key owner's permissions");
    }
}

type PermissionScopeInput = {
    spaceSlug: string | null;
    eventTypeSlug: string | null;
};

const scopeSchema = z.object({
    spaceSlug: slugSchema.nullable(),
    eventTypeSlug: slugSchema.nullable(),
});

const createSchema = z.object({
    name: z.string().min(1).max(255),
    isAdmin: z.boolean().default(false),
    // Personal key (owned by the caller). Non-admins can only create these.
    personal: z.boolean().default(true),
    // Initial permission rows
    permissions: z.array(scopeSchema).max(50).default([]),
});

// Create a key; returns the full rawKey exactly once
export const create = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(createSchema)
    .handler(async ({ data, context }) => {
        const personal = data.personal || !context.actor.isAdmin;
        const userId = personal ? context.user.id : null;
        await assertWithinOwner(userId, { isAdmin: data.isAdmin });
        for (const scope of data.permissions) {
            await assertWithinOwner(userId, { scope });
        }

        const { rawKey, keyHash, fingerprint } = generateApiKey();
        const keyResult = await context.db.transaction(async (tx) => {
            const [created] = await tx
                .insert(apiKey)
                .values({
                    name: data.name,
                    fingerprint,
                    userId,
                    isActive: true,
                })
                .returning({ id: apiKey.id, name: apiKey.name });
            if (!created) throw new Error("INTERNAL_SERVER_ERROR");
            await tx
                .insert(apiKeySecret)
                .values({ apiKeyId: created.id, keyHash });
            const [actorRecord] = await tx
                .insert(actor)
                .values({
                    kind: "apiKey",
                    apiKeyId: created.id,
                    isAdmin: data.isAdmin,
                })
                .returning();
            if (actorRecord && data.permissions.length > 0) {
                await tx.insert(permission).values(
                    data.permissions.map((scope) => ({
                        actorId: actorRecord.id,
                        spaceSlug: scope.spaceSlug,
                        eventTypeSlug: scope.eventTypeSlug,
                        source: "manual" as const,
                    })),
                );
            }
            return created;
        });

        authLog.info("api key created", {
            apiKeyId: keyResult.id,
            apiKeyName: keyResult.name,
            ownerUserId: userId ?? undefined,
            isAdmin: data.isAdmin,
            permissions: data.permissions.length,
            byUserId: context.user.id,
        });
        return { ...keyResult, rawKey };
    });

const updateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    isAdmin: z.boolean().optional(),
    isActive: z.boolean().optional(),
});

// Update name / isActive / admin flag
export const update = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(updateSchema)
    .handler(async ({ data, context }) => {
        const { id, isAdmin: isAdminUpdate, ...keyUpdates } = data;
        const existing = await loadManagedKey(context, id);

        if (isAdminUpdate) {
            await assertWithinOwner(existing.userId, { isAdmin: true });
        }
        if (Object.keys(keyUpdates).length > 0) {
            await context.db
                .update(apiKey)
                .set(keyUpdates)
                .where(eq(apiKey.id, id));
        }
        if (isAdminUpdate !== undefined) {
            await context.db
                .update(actor)
                .set({ isAdmin: isAdminUpdate })
                .where(eq(actor.apiKeyId, id));
        }

        const { actor: _a, user: _u, ...rest } = existing;
        return { ...rest, ...keyUpdates };
    });

// Hard delete (cascades to actor and permissions)
// `delete` is a reserved word, hence deleteApiKey
export const deleteApiKey = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const existing = await loadManagedKey(context, data.id);
        await context.db.delete(apiKey).where(eq(apiKey.id, existing.id));
        authLog.info("api key deleted", {
            apiKeyId: existing.id,
            ownerUserId: existing.userId ?? undefined,
            byUserId: context.user.id,
        });
        return { success: true };
    });

const addPermissionSchema = z.object({
    apiKeyId: z.string().uuid(),
    spaceSlug: slugSchema.nullable().optional(),
    eventTypeSlug: slugSchema.nullable().optional(),
});

// Add a permission to a key
export const addPermission = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(addPermissionSchema)
    .handler(async ({ data, context }) => {
        const existing = await loadManagedKey(context, data.apiKeyId);
        if (!existing.actor) throw notFound("Actor not found");
        const scope = {
            spaceSlug: data.spaceSlug ?? null,
            eventTypeSlug: data.eventTypeSlug ?? null,
        };
        await assertWithinOwner(existing.userId, { scope });

        const [result] = await context.db
            .insert(permission)
            .values({
                actorId: existing.actor.id,
                ...scope,
                source: "manual",
            })
            .returning();
        return result ?? null;
    });

// Remove a permission from a key
export const removePermission = createServerFn({ method: "POST" })
    .middleware([authed])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        const perm = await context.db.query.permission.findFirst({
            where: eq(permission.id, data.id),
            with: { actor: { columns: { apiKeyId: true } } },
        });
        if (!perm?.actor.apiKeyId) throw notFound();
        await loadManagedKey(context, perm.actor.apiKeyId);
        await context.db.delete(permission).where(eq(permission.id, data.id));
        return { success: true };
    });
