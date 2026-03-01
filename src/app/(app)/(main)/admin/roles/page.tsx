"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { api } from "@/trpc/react";

type Permission = {
    id: string;
    spaceSlug: string | null;
    eventTypeSlug: string | null;
    source: "oidc" | "manual";
};

type UserWithPermissions = {
    id: string;
    name: string;
    email: string;
    isAdmin: boolean;
    permissions: Permission[];
};

function formatPermissionScope(perm: Permission): string {
    if (!perm.spaceSlug && !perm.eventTypeSlug) {
        return "Global (all spaces & event types)";
    }
    if (perm.spaceSlug && !perm.eventTypeSlug) {
        return `Space: ${perm.spaceSlug}`;
    }
    if (!perm.spaceSlug && perm.eventTypeSlug) {
        return `Event Type: ${perm.eventTypeSlug} (all spaces)`;
    }
    return `Space: ${perm.spaceSlug} / Event Type: ${perm.eventTypeSlug}`;
}

export default function AdminRolesPage() {
    const [addPermOpen, setAddPermOpen] = useState(false);
    const [selectedUser, setSelectedUser] =
        useState<UserWithPermissions | null>(null);
    const [scopeType, setScopeType] = useState<
        "admin" | "global" | "space" | "eventType" | "scoped"
    >("global");

    const utils = api.useUtils();

    // Queries
    const { data: isAdmin, isLoading: isAdminLoading } =
        api.roles.isAdmin.useQuery();
    const { data: users, isLoading: usersLoading } =
        api.roles.listUsers.useQuery(undefined, { enabled: isAdmin });
    const { data: spaces } = api.roles.listSpaces.useQuery(undefined, {
        enabled: isAdmin,
    });
    const { data: eventTypes } = api.roles.listEventTypes.useQuery(undefined, {
        enabled: isAdmin,
    });

    // Mutations
    const addPermission = api.roles.addPermission.useMutation({
        onSuccess: () => {
            utils.roles.listUsers.invalidate();
            closeAddPermDialog();
        },
    });

    const removePermission = api.roles.removePermission.useMutation({
        onSuccess: () => {
            utils.roles.listUsers.invalidate();
        },
    });

    const setAdmin = api.roles.setAdmin.useMutation({
        onSuccess: () => {
            utils.roles.listUsers.invalidate();
        },
    });

    // Handlers
    const closeAddPermDialog = () => {
        setAddPermOpen(false);
        setSelectedUser(null);
        setScopeType("global");
    };

    const handleAddPermission = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedUser) return;

        if (scopeType === "admin") {
            setAdmin.mutate(
                { userId: selectedUser.id, isAdmin: true },
                { onSuccess: closeAddPermDialog },
            );
            return;
        }

        const formData = new FormData(e.currentTarget);
        let spaceSlug: string | null = null;
        let eventTypeSlug: string | null = null;

        if (scopeType === "space" || scopeType === "scoped") {
            const val = formData.get("spaceSlug") as string;
            spaceSlug =
                val && val !== "custom"
                    ? val
                    : (formData.get("customSpaceSlug") as string) || null;
        }
        if (scopeType === "eventType" || scopeType === "scoped") {
            const val = formData.get("eventTypeSlug") as string;
            eventTypeSlug =
                val && val !== "custom"
                    ? val
                    : (formData.get("customEventTypeSlug") as string) || null;
        }

        addPermission.mutate({
            userId: selectedUser.id,
            spaceSlug,
            eventTypeSlug,
        });
    };

    const handleRemovePermission = (id: string) => {
        if (confirm("Remove this permission?")) {
            removePermission.mutate({ id });
        }
    };

    // Loading state
    if (isAdminLoading) {
        return <p>Loading...</p>;
    }

    // Access denied
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

    const isPending =
        scopeType === "admin" ? setAdmin.isPending : addPermission.isPending;

    return (
        <>
            <div className="mb-8">
                <h1 className="mb-2 font-bold text-3xl">
                    Permission Management
                </h1>
                <p className="text-muted-foreground">
                    Manage user permissions for spaces and event types.
                </p>
                <p className="mt-2 text-muted-foreground text-sm">
                    Permissions from OIDC are synced automatically on login.
                    Manual permissions can be added here.
                </p>
            </div>

            {usersLoading ? (
                <p>Loading users...</p>
            ) : (
                <div className="space-y-4">
                    {users?.map((u) => (
                        <div className="rounded-lg border p-4" key={u.id}>
                            <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                        {u.name}
                                    </span>
                                    <span className="text-muted-foreground text-sm">
                                        {u.email}
                                    </span>
                                    {u.isAdmin && (
                                        <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs">
                                            Admin
                                        </span>
                                    )}
                                </div>
                                <Button
                                    onClick={() => {
                                        setSelectedUser(u);
                                        setAddPermOpen(true);
                                    }}
                                    size="sm"
                                    variant="outline"
                                >
                                    Add Permission
                                </Button>
                            </div>

                            {u.isAdmin || u.permissions.length > 0 ? (
                                <div className="space-y-1">
                                    {u.isAdmin && (
                                        <div className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
                                            <span className="text-muted-foreground">
                                                Admin — unlimited access to all
                                                spaces and event types
                                            </span>
                                            <Button
                                                onClick={() => {
                                                    if (
                                                        confirm(
                                                            "Remove admin access from this user?",
                                                        )
                                                    ) {
                                                        setAdmin.mutate({
                                                            userId: u.id,
                                                            isAdmin: false,
                                                        });
                                                    }
                                                }}
                                                size="sm"
                                                variant="ghost"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    )}
                                    {u.permissions.map((perm) => (
                                        <div
                                            className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm"
                                            key={perm.id}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    {formatPermissionScope(
                                                        perm,
                                                    )}
                                                </span>
                                                <span
                                                    className={`rounded px-1.5 py-0.5 text-xs ${
                                                        perm.source === "oidc"
                                                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                                    }`}
                                                >
                                                    {perm.source}
                                                </span>
                                            </div>
                                            {perm.source === "manual" && (
                                                <Button
                                                    onClick={() =>
                                                        handleRemovePermission(
                                                            perm.id,
                                                        )
                                                    }
                                                    size="sm"
                                                    variant="ghost"
                                                >
                                                    Remove
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    No specific permissions (requires admin or
                                    OIDC claims)
                                </p>
                            )}
                        </div>
                    ))}

                    {users?.length === 0 && (
                        <p className="text-muted-foreground">No users found.</p>
                    )}
                </div>
            )}

            {/* Add Permission Dialog */}
            <Dialog onOpenChange={closeAddPermDialog} open={addPermOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Add Permission for {selectedUser?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleAddPermission}>
                        <div>
                            <Label>Permission Scope</Label>
                            <Select
                                onValueChange={(v) =>
                                    setScopeType(
                                        v as
                                            | "admin"
                                            | "global"
                                            | "space"
                                            | "eventType"
                                            | "scoped",
                                    )
                                }
                                value={scopeType}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">
                                        Admin Access (full access)
                                    </SelectItem>
                                    <SelectItem value="global">
                                        Global (all spaces & event types)
                                    </SelectItem>
                                    <SelectItem value="space">
                                        Specific Space
                                    </SelectItem>
                                    <SelectItem value="eventType">
                                        Specific Event Type (all spaces)
                                    </SelectItem>
                                    <SelectItem value="scoped">
                                        Specific Space + Event Type
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {scopeType === "admin" && (
                            <p className="text-muted-foreground text-sm">
                                Grants this user unlimited access to all spaces
                                and event types, bypassing all permission
                                checks.
                            </p>
                        )}

                        {(scopeType === "space" || scopeType === "scoped") && (
                            <div>
                                <Label htmlFor="spaceSlug">Space</Label>
                                <Select name="spaceSlug">
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select or enter slug" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {spaces?.map((s) => (
                                            <SelectItem
                                                key={s.id}
                                                value={s.slug}
                                            >
                                                {s.name} ({s.slug})
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="custom">
                                            Enter custom slug...
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    className="mt-2"
                                    name="customSpaceSlug"
                                    pattern="[a-z0-9-]+"
                                    placeholder="Custom space slug (for future spaces)"
                                />
                            </div>
                        )}

                        {(scopeType === "eventType" ||
                            scopeType === "scoped") && (
                            <div>
                                <Label htmlFor="eventTypeSlug">
                                    Event Type
                                </Label>
                                <Select name="eventTypeSlug">
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select or enter slug" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {eventTypes?.map((et) => (
                                            <SelectItem
                                                key={et.id}
                                                value={et.slug}
                                            >
                                                {et.name} ({et.slug})
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="custom">
                                            Enter custom slug...
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    className="mt-2"
                                    name="customEventTypeSlug"
                                    pattern="[a-z0-9-]+"
                                    placeholder="Custom event type slug"
                                />
                            </div>
                        )}

                        <Button disabled={isPending} type="submit">
                            {isPending
                                ? "Saving..."
                                : scopeType === "admin"
                                  ? "Grant Admin Access"
                                  : "Add Permission"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
