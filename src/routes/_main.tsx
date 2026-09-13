import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Header } from "@/components/header";
import { accountQueries } from "@/lib/queries/account";

// Pathless layout: every page except /login gets the header + container.
export const Route = createFileRoute("/_main")({
    // Own capabilities gate management controls on several pages; prefetch
    // them for signed-in users so those controls are in the server render
    // instead of popping in after hydration
    loader: async ({ context }) => {
        if (context.session?.user) {
            await context.queryClient.ensureQueryData(accountQueries.info());
        }
    },
    component: MainLayout,
});

function MainLayout() {
    const { session, isAdmin } = Route.useRouteContext();

    return (
        <div className="min-h-screen bg-background">
            <Header isAdmin={isAdmin} user={session?.user ?? null} />
            <main className="container mx-auto px-4 py-8">
                <Outlet />
            </main>
        </div>
    );
}
