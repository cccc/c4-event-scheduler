import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { authLog } from "@/server/auth-log";
import { authed } from "@/server/auth-middleware";
import { feedToken } from "@/server/db/schema";
import { feedTokenFingerprint, generateFeedToken } from "@/server/feed-token";

/** The signed-in user's feed token, or null if none exists yet */
export const getFeedToken = createServerFn({ method: "GET" })
    .middleware([authed])
    .handler(async ({ context }) => {
        const row = await context.db.query.feedToken.findFirst({
            where: eq(feedToken.userId, context.user.id),
        });
        return row ? { token: row.token, createdAt: row.createdAt } : null;
    });

/**
 * Create the feed token, or replace it: every link built with the previous
 * token stops working.
 */
export const regenerateFeedToken = createServerFn({ method: "POST" })
    .middleware([authed])
    .handler(async ({ context }) => {
        const token = generateFeedToken();
        await context.db
            .insert(feedToken)
            .values({ userId: context.user.id, token })
            .onConflictDoUpdate({
                target: feedToken.userId,
                set: { token, createdAt: new Date() },
            });
        authLog.info("feed token generated", {
            userId: context.user.id,
            fingerprint: feedTokenFingerprint(token),
        });
        return { token };
    });
