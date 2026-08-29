import { getApiKeyFromRequest } from "./api-key-auth";
import { authLog } from "./auth-log";
import {
    type Actor,
    actorFromApiKey,
    can,
    describeActor,
    type PermissionScope,
} from "./permissions";

type RouteParams = Record<string, string | undefined>;

/** What TanStack Start passes to `server.handlers` functions */
type RouteHandlerContext = {
    request: Request;
    params: RouteParams;
};

type ApiHandler = (
    req: Request,
    actor: Actor,
    params: RouteParams,
) => Promise<Response>;

type OptionalApiHandler = (
    req: Request,
    actor: Actor | null,
    params: RouteParams,
) => Promise<Response>;

/**
 * Wraps a REST route handler with required API key authentication.
 * Returns 401 if no valid key is present.
 */
export function withApiAuth(handler: ApiHandler) {
    return async ({ request, params }: RouteHandlerContext) => {
        const key = await getApiKeyFromRequest(request);
        if (!key) {
            authLog.warn("rest unauthorized", {
                method: request.method,
                path: new URL(request.url).pathname,
                hasAuthHeader: request.headers.has("authorization"),
            });
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handler(request, actorFromApiKey(key), params);
    };
}

/**
 * Wraps a REST route handler with optional API key authentication.
 * Passes actor=null when no key is present (public access).
 */
export function withOptionalApiAuth(handler: OptionalApiHandler) {
    return async ({ request, params }: RouteHandlerContext) => {
        const key = await getApiKeyFromRequest(request);
        const actor = key ? actorFromApiKey(key) : null;
        return handler(request, actor, params);
    };
}

/**
 * Permission check for REST handlers: returns a 403 response (and logs the
 * denial) when the actor lacks the permission, or null when it is allowed.
 *
 *   const denied = requirePermission(req, actor, "manage:events", scope);
 *   if (denied) return denied;
 */
export function requirePermission(
    req: Request,
    actor: Actor,
    action: string,
    scope?: PermissionScope,
): Response | null {
    const fields = {
        method: req.method,
        path: new URL(req.url).pathname,
        action,
        spaceSlug: scope?.spaceSlug,
        eventTypeSlug: scope?.eventTypeSlug,
    };
    if (can(actor, action, scope)) {
        authLog.debug("rest permission granted", {
            ...fields,
            actorKind: actor.kind,
            actorId: actor.id,
        });
        return null;
    }
    authLog.warn("rest permission denied", {
        ...fields,
        ...describeActor(actor),
    });
    return Response.json({ error: "Forbidden" }, { status: 403 });
}
