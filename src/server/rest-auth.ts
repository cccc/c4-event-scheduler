import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getApiKeyFromRequest } from "./api-key-auth";
import { type Actor, actorFromApiKey } from "./permissions";

type ApiHandler = (
    req: NextRequest,
    actor: Actor,
    params: Record<string, string>,
) => Promise<NextResponse>;

type OptionalApiHandler = (
    req: NextRequest,
    actor: Actor | null,
    params: Record<string, string>,
) => Promise<NextResponse>;

/**
 * Wraps a REST route handler with required API key authentication.
 * Returns 401 if no valid key is present.
 */
export function withApiAuth(handler: ApiHandler) {
    return async (
        req: NextRequest,
        ctx: { params: Promise<Record<string, string>> },
    ) => {
        const key = await getApiKeyFromRequest(req);
        if (!key)
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        return handler(req, actorFromApiKey(key), await ctx.params);
    };
}

/**
 * Wraps a REST route handler with optional API key authentication.
 * Passes actor=null when no key is present (public access).
 */
export function withOptionalApiAuth(handler: OptionalApiHandler) {
    return async (
        req: NextRequest,
        ctx: { params: Promise<Record<string, string>> },
    ) => {
        const key = await getApiKeyFromRequest(req);
        const actor = key ? actorFromApiKey(key) : null;
        return handler(req, actor, await ctx.params);
    };
}
