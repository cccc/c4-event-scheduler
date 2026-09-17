import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import "@fontsource-variable/geist";
import { ThemeProvider } from "next-themes";

import { TimezoneProvider } from "@/components/timezone-provider";
import { Toaster } from "@/components/ui/sonner";
import { appQueries } from "@/lib/queries/app";
import appCss from "@/styles/globals.css?url";

interface RouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1",
            },
            { title: "C4 Events - Event Calendar" },
            {
                name: "description",
                content:
                    "Event calendar with recurring events, iCal feeds, and RBAC",
            },
        ],
        links: [
            { rel: "stylesheet", href: appCss },
            { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
            { rel: "icon", href: "/favicon.ico", sizes: "any" },
        ],
    }),
    // Resolve the session, admin flag and runtime config once for the whole
    // tree; child routes read them from context (guards, header, login form).
    // beforeLoad runs on every navigation, so the result is cached in the
    // query client and only refetched after login, logout, account edits or
    // a 401 (they invalidate the cache), not for every search param change.
    // fetchQuery, not ensureQueryData: the latter returns cached data even
    // when the query has been invalidated.
    beforeLoad: async ({ context }) => {
        const app = await context.queryClient.fetchQuery(appQueries.context());
        return {
            session: app.session,
            isAdmin: app.isAdmin,
            timezone: app.timezone,
            appUrl: app.appUrl,
            authOptions: app.auth,
        };
    },
    shellComponent: RootDocument,
    component: RootComponent,
});

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <HeadContent />
                {/* Reveals .noscript-only content and open dialogs
                    (ui/dialog.tsx) and hides .script-only content (see
                    globals.css). Only a <style> may live in here: script
                    blockers re-inject noscript content with its nesting
                    flattened */}
                <noscript>
                    <style>
                        {
                            ".noscript-only { display: contents; } .script-only { display: none; } dialog[open]:not(:modal) { display: block; }"
                        }
                    </style>
                </noscript>
            </head>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    disableTransitionOnChange
                    enableSystem
                >
                    {children}
                    <Toaster position="bottom-right" richColors />
                </ThemeProvider>
                <Scripts />
            </body>
        </html>
    );
}

function RootComponent() {
    const { timezone } = Route.useRouteContext();
    return (
        <TimezoneProvider tz={timezone}>
            <Outlet />
            <TanStackDevtools
                config={{ position: "bottom-right" }}
                plugins={[
                    {
                        name: "TanStack Router",
                        render: <TanStackRouterDevtoolsPanel />,
                    },
                    {
                        name: "TanStack Query",
                        render: <ReactQueryDevtoolsPanel />,
                    },
                ]}
            />
        </TimezoneProvider>
    );
}
