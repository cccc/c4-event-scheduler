import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { generateApiKey } from "@/server/api-key-auth";
import { admin } from "@/server/auth-middleware";
import { actor, apiKey, permission } from "@/server/db/schema";
import { notFound } from "@/server/fn-errors";

const slugPattern = /^[a-z0-9-]+$/;

// List all API keys with their permissions (no keyHash exposed)
export const list = createServerFn({ method: "GET" })
    .middleware([admin])
    .handler(async ({ context }) => {
        const keys = await context.db.query.apiKey.findMany({
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
    });

const createSchema = z.object({
    name: z.string().min(1).max(255),
    isAdmin: z.boolean().default(false),
});

// Create a new API key; returns the full rawKey exactly once
export const create = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(createSchema)
    .handler(async ({ data, context }) => {
        const { rawKey, keyHash } = generateApiKey();

        const [keyResult] = await context.db
            .insert(apiKey)
            .values({
                name: data.name,
                keyHash,
                isActive: true,
            })
            .returning();

        if (!keyResult) throw new Error("INTERNAL_SERVER_ERROR");

        // Create the corresponding actor for this API key (with isAdmin)
        await context.db.insert(actor).values({
            kind: "apiKey",
            apiKeyId: keyResult.id,
            isAdmin: data.isAdmin,
        });

        // Return rawKey to the caller; this is the only time it will be shown
        return { ...keyResult, rawKey };
    });

const updateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    isAdmin: z.boolean().optional(),
    isActive: z.boolean().optional(),
});

// Update name / isAdmin / isActive
export const update = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(updateSchema)
    .handler(async ({ data, context }) => {
        const { id, isAdmin: isAdminUpdate, ...keyUpdates } = data;

        // Verify the key exists
        const existing = await context.db.query.apiKey.findFirst({
            where: eq(apiKey.id, id),
        });
        if (!existing) throw notFound();

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

        const { keyHash: _hash, ...rest } = { ...existing, ...keyUpdates };
        return rest;
    });

// Hard delete (cascades to actor and permissions)
// `delete` is a reserved word, hence deleteApiKey
export const deleteApiKey = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(z.object({ id: z.string().uuid() }))
    .handler(async ({ data, context }) => {
        await context.db.delete(apiKey).where(eq(apiKey.id, data.id));
        return { success: true };
    });

const addPermissionSchema = z.object({
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
});

// Add a permission to an API key
export const addPermission = createServerFn({ method: "POST" })
    .middleware([admin])
    .validator(addPermissionSchema)
    .handler(async ({ data, context }) => {
        const actorRecord = await context.db.query.actor.findFirst({
            where: eq(actor.apiKeyId, data.apiKeyId),
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
