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
import { getAppContext } from "@/server/fns/app";
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
    beforeLoad: async () => {
        const app = await getAppContext();
        return {
            session: app.session,
            isAdmin: app.isAdmin,
            timezone: app.timezone,
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
