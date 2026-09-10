import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
    ApiKeyList,
    CreateApiKeyDialog,
} from "@/components/api-keys/api-key-manager";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import type { Capabilities } from "@/lib/permissions-core";
import { apiKeysQueries } from "@/lib/queries/api-keys";

/** Self-service personal API keys on the account page. */
export function PersonalApiKeysCard({
    owner,
}: {
    /** The signed-in user's effective rights (bound the grantable scopes) */
    owner: Capabilities | undefined;
}) {
    const { data: keys, isLoading } = useQuery(apiKeysQueries.mine());
    const [createOpen, setCreateOpen] = useState(false);
    const capabilities = owner ?? { isAdmin: false, permissions: [] };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle>API Keys</CardTitle>
                        <CardDescription>
                            Personal keys for the REST API and iCal feeds. A key
                            can only do what its permissions and yours both
                            allow, and it is deleted with your account.
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setCreateOpen(true)}
                        size="sm"
                        type="button"
                    >
                        Create Key
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-muted-foreground text-sm">Loading...</p>
                ) : (
                    <ApiKeyList
                        capabilities={capabilities}
                        emptyText="You have no API keys."
                        keys={keys ?? []}
                    />
                )}
            </CardContent>

            <CreateApiKeyDialog
                capabilities={capabilities}
                onClose={() => setCreateOpen(false)}
                open={createOpen}
                personal
            />
        </Card>
    );
}
