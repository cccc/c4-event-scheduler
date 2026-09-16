import { createFileRoute } from "@tanstack/react-router";

import { INTEGRATIONS_MENU, NavMenuPage } from "@/components/nav-menus";

// The Integrations menu as a page, for browsers without JavaScript (the
// header's dropdown needs scripts, its trigger links here instead)
export const Route = createFileRoute("/_main/integrations")({
    component: IntegrationsPage,
});

function IntegrationsPage() {
    return (
        <NavMenuPage
            description="Use the calendars outside this app."
            items={INTEGRATIONS_MENU}
            title="Integrations"
        />
    );
}
