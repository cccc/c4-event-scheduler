import { createFileRoute, redirect } from "@tanstack/react-router";

import { ADMIN_MENU, NavMenuPage } from "@/components/nav-menus";

// The Admin menu as a page, for browsers without JavaScript (the header's
// dropdown needs scripts, its trigger links here instead)
export const Route = createFileRoute("/_main/admin/")({
    beforeLoad: ({ context }) => {
        if (!context.session) throw redirect({ to: "/login" });
    },
    component: AdminPage,
});

function AdminPage() {
    const { isAdmin } = Route.useRouteContext();

    if (!isAdmin) {
        return (
            <div className="py-12 text-center">
                <h1 className="mb-2 font-bold text-2xl">Access Denied</h1>
                <p className="text-muted-foreground">
                    You need admin privileges to access this page.
                </p>
            </div>
        );
    }

    return (
        <NavMenuPage
            description="Manage who can do what."
            items={ADMIN_MENU}
            title="Admin"
        />
    );
}
