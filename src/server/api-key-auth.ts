import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/server/db";
import { apiKey } from "@/server/db/schema";

export type ApiKeyWithPermissions = Awaited<
	ReturnType<typeof getApiKeyFromRequest>
>;

/**
 * Extract and verify an API key from the Authorization header.
 * Format: "Bearer c4k_<32 chars>"
 *
 * Returns the key record (with permissions loaded) if valid, null otherwise.
 * Also fires-and-forgets a lastUsedAt update.
 */
export async function getApiKeyFromRequest(request: NextRequest) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer c4k_")) return null;

	const rawKey = authHeader.slice(7); // remove "Bearer "
	// Strip optional fingerprint suffix (e.g. "c4k_...#ae2f3933" → "c4k_...")
	const baseKey = rawKey.includes("#")
		? (rawKey.split("#")[0] ?? rawKey)
		: rawKey;
	const hash = createHash("sha256").update(baseKey).digest("hex");

	const key = await db.query.apiKey.findFirst({
		where: and(eq(apiKey.keyHash, hash), eq(apiKey.isActive, true)),
		with: { permissions: true },
	});

	if (!key) return null;

	// Fire-and-forget: update lastUsedAt without blocking the response
	void db
		.update(apiKey)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKey.id, key.id));

	return key;
}

/**
 * Generate a new API key.
 * Returns { rawKey, keyPrefix, keyHash }
 * The rawKey must be returned to the user exactly once; only hash and prefix are stored.
 */
export function generateApiKey(): { rawKey: string; keyHash: string } {
	const random = randomBytes(24).toString("base64url");
	const baseKey = `c4k_${random}`;
	const keyHash = createHash("sha256").update(baseKey).digest("hex");
	// Append the first 8 hex chars of the hash as a human-readable fingerprint.
	// The suffix is for identification only — verification always strips it first.
	const rawKey = `${baseKey}#${keyHash.slice(0, 8)}`;
	return { rawKey, keyHash };
}
