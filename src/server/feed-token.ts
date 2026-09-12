import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { authLog } from "@/server/auth-log";
import { db } from "@/server/db";
import { feedToken } from "@/server/db/schema";

/** Distinguishes feed tokens from API keys (`c4k_`) in the same ?key= slot */
export const FEED_TOKEN_PREFIX = "c4f_";

export function isFeedToken(raw: string): boolean {
    return raw.startsWith(FEED_TOKEN_PREFIX);
}

export function generateFeedToken(): string {
    return `${FEED_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

/** Log identifier; the token itself is never logged */
export function feedTokenFingerprint(token: string): string {
    return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

/**
 * Feed routes only: resolve a `?key=c4f_...` query parameter to the owning
 * user. Returns null for an unknown token (the caller answers 401) and for
 * requests without a feed token.
 */
export async function getFeedTokenUserFromRequest(
    request: Request,
): Promise<{ userId: string } | null> {
    const url = new URL(request.url);
    const raw = url.searchParams.get("key");
    if (raw === null || !isFeedToken(raw)) return null;

    const row = await db.query.feedToken.findFirst({
        where: eq(feedToken.token, raw),
        columns: { userId: true },
    });
    if (!row) {
        authLog.warn("feed token rejected: unknown", {
            path: url.pathname,
            fingerprint: feedTokenFingerprint(raw),
        });
        return null;
    }
    authLog.debug("feed token authenticated", {
        path: url.pathname,
        userId: row.userId,
        fingerprint: feedTokenFingerprint(raw),
    });
    return row;
}
