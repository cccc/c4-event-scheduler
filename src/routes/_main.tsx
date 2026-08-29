import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Header } from "@/components/header";

// Pathless layout: every page except /login gets the header + container.
export const Route = createFileRoute("/_main")({
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
