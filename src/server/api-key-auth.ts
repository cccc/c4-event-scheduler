import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { authLog } from "@/server/auth-log";
import { db } from "@/server/db";
import { apiKey } from "@/server/db/schema";

export type ApiKeyWithActor = Awaited<ReturnType<typeof getApiKeyFromRequest>>;

type ApiKeyRequestOptions = {
    /**
     * Also accept the key as a `?key=` query parameter. Only for endpoints
     * consumed by clients that cannot send headers (iCal feed subscriptions);
     * the raw key then ends up in request logs of any intermediate proxy.
     */
    allowQueryParam?: boolean;
};

/**
 * Locate API key credentials by precedence: `?key=` query parameter (only
 * where allowed), then the X-Api-Key header, then "Authorization: Bearer".
 * An Authorization header with another scheme (e.g. Basic) is not treated
 * as API key credentials.
 */
function findRawApiKey(
    request: Request,
    options: ApiKeyRequestOptions = {},
): { rawKey: string; source: string } | null {
    if (options.allowQueryParam) {
        const queryKey = new URL(request.url).searchParams.get("key");
        if (queryKey !== null) {
            return { rawKey: queryKey, source: "key query parameter" };
        }
    }
    const headerKey = request.headers.get("x-api-key");
    if (headerKey !== null) {
        return { rawKey: headerKey, source: "x-api-key header" };
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer c4k_")) {
        return {
            rawKey: authHeader.slice(7), // remove "Bearer "
            source: "authorization header",
        };
    }
    return null;
}

/**
 * Whether the request carries API key credentials at all (used to
 * distinguish "anonymous" from "invalid key" without re-verifying).
 */
export function hasApiKeyCredentials(
    request: Request,
    options: ApiKeyRequestOptions = {},
): boolean {
    return findRawApiKey(request, options) !== null;
}

/**
 * Extract and verify an API key (see findRawApiKey for the accepted
 * sources and their precedence).
 *
 * Returns the key record (with actor + permissions loaded) if valid, null otherwise.
 * Also fires-and-forgets a lastUsedAt update.
 */
export async function getApiKeyFromRequest(
    request: Request,
    options: ApiKeyRequestOptions = {},
) {
    const path = new URL(request.url).pathname;
    const found = findRawApiKey(request, options);
    if (!found) {
        const authHeader = request.headers.get("authorization");
        if (authHeader) {
            authLog.debug("ignoring authorization header: not an api key", {
                method: request.method,
                path: path,
                scheme: authHeader.split(" ")[0],
            });
        }
        return null;
    }
    const { rawKey, source } = found;
    if (!rawKey.startsWith("c4k_")) {
        authLog.debug(`ignoring ${source}: not an api key`, {
            method: request.method,
            path: path,
        });
        return null;
    }

    // Strip optional fingerprint suffix (e.g. "c4k_...#ae2f3933" → "c4k_...")
    const baseKey = rawKey.includes("#")
        ? (rawKey.split("#")[0] ?? rawKey)
        : rawKey;
    const hash = createHash("sha256").update(baseKey).digest("hex");

    const key = await db.query.apiKey.findFirst({
        where: and(eq(apiKey.keyHash, hash), eq(apiKey.isActive, true)),
        with: {
            actor: { with: { permissions: true } },
        },
    });

    if (!key) {
        authLog.warn("api key rejected: unknown or inactive", {
            method: request.method,
            path: path,
            // The fingerprint suffix is the public identifier; the key itself is never logged
            fingerprint: rawKey.includes("#")
                ? rawKey.split("#")[1]
                : undefined,
            keyLength: baseKey.length,
        });
        return null;
    }

    authLog.debug("api key authenticated", {
        method: request.method,
        path: path,
        apiKeyId: key.id,
        apiKeyName: key.name,
    });

    // Fire-and-forget lastUsedAt update; never blocks or fails the request
    void db
        .update(apiKey)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKey.id, key.id))
        .catch((error) =>
            authLog.error("failed to update api key lastUsedAt", {
                apiKeyId: key.id,
                error,
            }),
        );

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
