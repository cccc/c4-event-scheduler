import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import {
    ADMIN_CAPABILITIES,
    ApiKeyList,
    CreateApiKeyDialog,
} from "@/components/api-keys/api-key-manager";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { apiKeysQueries } from "@/lib/queries/api-keys";

export const Route = createFileRoute("/_main/admin/api-keys")({
    beforeLoad: ({ context }) => {
        if (!context.session) throw redirect({ to: "/login" });
    },
    component: AdminApiKeysPage,
});

function AdminApiKeysPage() {
    const { isAdmin } = Route.useRouteContext();
    const [createOpen, setCreateOpen] = useState(false);
    const { data: keys, isLoading } = useQuery({
        ...apiKeysQueries.list(),
        enabled: isAdmin,
    });

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

    const serviceKeys = keys?.filter((k) => !k.owner) ?? [];
    const personalKeys = [...(keys?.filter((k) => k.owner) ?? [])].sort(
        (a, b) => (a.owner?.name ?? "").localeCompare(b.owner?.name ?? ""),
    );

    return (
        <>
            <PageHeader
                description="Keys for the REST API and iCal feeds."
                title="API Key Management"
            >
                <Button onClick={() => setCreateOpen(true)}>
                    Create Service Key
                </Button>
            </PageHeader>

            {isLoading ? (
                <p>Loading keys...</p>
            ) : (
                <div className="space-y-10">
                    <section>
                        <h2 className="mb-1 font-semibold text-xl">
                            Service keys
                        </h2>
                        <p className="mb-4 text-muted-foreground text-sm">
                            Not tied to a person; they carry their own admin
                            flag and permissions.
                        </p>
                        <ApiKeyList
                            capabilities={ADMIN_CAPABILITIES}
                            emptyText="No service keys."
                            keys={serviceKeys}
                        />
                    </section>

                    <section>
                        <h2 className="mb-1 font-semibold text-xl">
                            Personal keys
                        </h2>
                        <p className="mb-4 text-muted-foreground text-sm">
                            Created by users on their account page. They act as
                            their owner: an action needs both the key's and the
                            owner's permission, and events are attributed to the
                            owner.
                        </p>
                        <ApiKeyList
                            capabilities={ADMIN_CAPABILITIES}
                            emptyText="No personal keys."
                            keys={personalKeys}
                            showOwner
                        />
                    </section>
                </div>
            )}

            <CreateApiKeyDialog
                capabilities={ADMIN_CAPABILITIES}
                onClose={() => setCreateOpen(false)}
                open={createOpen}
                personal={false}
            />
        </>
    );
}
