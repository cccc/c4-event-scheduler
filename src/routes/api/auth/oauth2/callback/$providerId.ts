import { createFileRoute } from "@tanstack/react-router";
import { authLog } from "@/server/auth-log";
import { auth } from "@/server/better-auth";

/**
 * Compatibility for the pre-better-auth-1.7 OAuth callback URL
 * (/api/auth/oauth2/callback/:id), which is what older IdP client
 * registrations still point at. The request is handed to better-auth as if
 * it had arrived at the current /api/auth/callback/:id path; query string,
 * cookies and body are preserved. For the token exchange to succeed the same
 * legacy URL must also be configured as BETTER_AUTH_OIDC_REDIRECT_URI.
 */
function forward(request: Request) {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(
        "/api/auth/oauth2/callback/",
        "/api/auth/callback/",
    );
    authLog.debug("forwarding legacy oauth callback", {
        from: new URL(request.url).pathname,
        to: url.pathname,
    });
    return auth.handler(new Request(url, request));
}

export const Route = createFileRoute("/api/auth/oauth2/callback/$providerId")({
    server: {
        handlers: {
            GET: ({ request }) => forward(request),
            POST: ({ request }) => forward(request),
        },
    },
});
