import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { usersKeys, usersQueries } from "@/lib/queries/users";
import {
    addPermission as addPermissionFn,
    createLocalUser as createLocalUserFn,
    deleteUser as deleteUserFn,
    removePermission as removePermissionFn,
    setAdmin as setAdminFn,
    setUserPassword as setUserPasswordFn,
    updateUser as updateUserFn,
} from "@/server/fns/users";

export const Route = createFileRoute("/_main/admin/users")({
    beforeLoad: ({ context }) => {
        if (!context.session) throw redirect({ to: "/login" });
    },
    component: AdminUsersPage,
});

type Permission = {
    id: string;
    spaceSlug: string | null;
    eventTypeSlug: string | null;
    source: "oidc" | "manual";
};

type UserRow = {
    id: string;
    name: string;
    email: string;
    isAdmin: boolean;
    providers: string[];
    hasPassword: boolean;
    permissions: Permission[];
};

type ScopeType = "admin" | "global" | "space" | "eventType" | "scoped";

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

function AdminUsersPage() {
    // Add Permission dialog
    const [addPermOpen, setAddPermOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
    const [scopeType, setScopeType] = useState<ScopeType>("global");

    // Add Local User dialog
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createEmail, setCreateEmail] = useState("");
    const [createPassword, setCreatePassword] = useState("");
    const [createIsAdmin, setCreateIsAdmin] = useState(false);

    // Edit dialog
    const [editUser, setEditUser] = useState<UserRow | null>(null);
    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");

    // Set password dialog
    const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const queryClient = useQueryClient();
    const { isAdmin, session, authOptions } = Route.useRouteContext();
    const currentUserId = session?.user.id;

    // Queries
    const { data: users, isLoading: usersLoading } = useQuery({
        ...usersQueries.listUsers(),
        enabled: isAdmin,
    });
    const { data: spaces } = useQuery({
        ...usersQueries.listSpaces(),
        enabled: isAdmin,
    });
    const { data: eventTypes } = useQuery({
        ...usersQueries.listEventTypes(),
        enabled: isAdmin,
    });

    const invalidateUsers = () =>
        queryClient.invalidateQueries({ queryKey: usersKeys.all });

    // Mutations
    const addPermission = useMutation({
        mutationFn: (input: Parameters<typeof addPermissionFn>[0]["data"]) =>
            addPermissionFn({ data: input }),
        onSuccess: () => {
            invalidateUsers();
            closeAddPermDialog();
        },
        onError: (error) => toast.error(error.message),
    });

    const removePermission = useMutation({
        mutationFn: (input: Parameters<typeof removePermissionFn>[0]["data"]) =>
            removePermissionFn({ data: input }),
        onSuccess: () => {
            invalidateUsers();
        },
        onError: (error) => toast.error(error.message),
    });

    const setAdmin = useMutation({
        mutationFn: (input: Parameters<typeof setAdminFn>[0]["data"]) =>
            setAdminFn({ data: input }),
        onSuccess: () => {
            invalidateUsers();
        },
        onError: (error) => toast.error(error.message),
    });

    const createLocalUser = useMutation({
        mutationFn: (input: Parameters<typeof createLocalUserFn>[0]["data"]) =>
            createLocalUserFn({ data: input }),
        onSuccess: (created) => {
            toast.success(`User ${created.email} created`);
            invalidateUsers();
            closeCreateDialog();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateUser = useMutation({
        mutationFn: (input: Parameters<typeof updateUserFn>[0]["data"]) =>
            updateUserFn({ data: input }),
        onSuccess: () => {
            toast.success("User updated");
            invalidateUsers();
            closeEditDialog();
        },
        onError: (error) => toast.error(error.message),
    });

    const setUserPassword = useMutation({
        mutationFn: (input: Parameters<typeof setUserPasswordFn>[0]["data"]) =>
            setUserPasswordFn({ data: input }),
        onSuccess: () => {
            toast.success("Password set");
            invalidateUsers();
            closePasswordDialog();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteUser = useMutation({
        mutationFn: (input: Parameters<typeof deleteUserFn>[0]["data"]) =>
            deleteUserFn({ data: input }),
        onSuccess: () => {
            toast.success("User deleted");
            invalidateUsers();
        },
        onError: (error) => toast.error(error.message),
    });

    // Handlers
    const closeAddPermDialog = () => {
        setAddPermOpen(false);
        setSelectedUser(null);
        setScopeType("global");
    };

    const closeCreateDialog = () => {
        setCreateOpen(false);
        setCreateName("");
        setCreateEmail("");
        setCreatePassword("");
        setCreateIsAdmin(false);
    };

    const openEditDialog = (u: UserRow) => {
        setEditUser(u);
        setEditName(u.name);
        setEditEmail(u.email);
    };

    const closeEditDialog = () => {
        setEditUser(null);
        setEditName("");
        setEditEmail("");
    };

    const openPasswordDialog = (u: UserRow) => {
        setPasswordUser(u);
        setNewPassword("");
        setConfirmPassword("");
    };

    const closePasswordDialog = () => {
        setPasswordUser(null);
        setNewPassword("");
        setConfirmPassword("");
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

    const handleCreateUser = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        createLocalUser.mutate({
            name: createName,
            email: createEmail,
            password: createPassword,
            isAdmin: createIsAdmin,
        });
    };

    const handleUpdateUser = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editUser) return;
        updateUser.mutate({
            userId: editUser.id,
            name: editName,
            email: editEmail,
        });
    };

    const handleSetPassword = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!passwordUser) return;
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        setUserPassword.mutate({
            userId: passwordUser.id,
            password: newPassword,
        });
    };

    const handleDeleteUser = (u: UserRow) => {
        if (
            confirm(
                `Delete user ${u.name} (${u.email})? This removes all their sessions and permissions.`,
            )
        ) {
            deleteUser.mutate({ userId: u.id });
        }
    };

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
            <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="mb-2 font-bold text-3xl">Users</h1>
                    <p className="text-muted-foreground">
                        Manage users, local accounts and permissions.
                    </p>
                    <p className="mt-2 text-muted-foreground text-sm">
                        Permissions from OIDC are synced automatically on login.
                        Manual permissions can be added here.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    Add Local User
                </Button>
            </div>

            {!authOptions.emailEnabled && (
                <Alert className="mb-6">
                    <AlertTitle>Email/password sign-in is disabled</AlertTitle>
                    <AlertDescription>
                        Email/password sign-in is disabled
                        (AUTH_EMAIL_ENABLED=false). Local users can be managed
                        but cannot sign in until it is enabled.
                    </AlertDescription>
                </Alert>
            )}

            {usersLoading ? (
                <p>Loading users...</p>
            ) : (
                <div className="space-y-4">
                    {users?.map((u) => (
                        <div className="rounded-lg border p-4" key={u.id}>
                            <div className="mb-3 flex items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">
                                        {u.name}
                                    </span>
                                    <span className="text-muted-foreground text-sm">
                                        {u.email}
                                    </span>
                                    {u.isAdmin && <Badge>Admin</Badge>}
                                    {u.providers.includes("oidc") && (
                                        <Badge variant="secondary">SSO</Badge>
                                    )}
                                    {u.hasPassword && (
                                        <Badge variant="outline">Local</Badge>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
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
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                aria-label="User actions"
                                                size="icon"
                                                variant="ghost"
                                            >
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    openEditDialog(u)
                                                }
                                            >
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    openPasswordDialog(u)
                                                }
                                            >
                                                {u.hasPassword
                                                    ? "Reset password"
                                                    : "Set local password"}
                                            </DropdownMenuItem>
                                            {u.id !== currentUserId && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            handleDeleteUser(u)
                                                        }
                                                        variant="destructive"
                                                    >
                                                        Delete
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {u.isAdmin || u.permissions.length > 0 ? (
                                <div className="space-y-1">
                                    {u.isAdmin && (
                                        <div className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
                                            <span className="text-muted-foreground">
                                                Admin - unlimited access to all
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
                                    setScopeType(v as ScopeType)
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

            {/* Add Local User Dialog */}
            <Dialog
                onOpenChange={(open) => {
                    if (!open) closeCreateDialog();
                }}
                open={createOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Local User</DialogTitle>
                        <DialogDescription>
                            Creates an account that signs in with email and
                            password.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleCreateUser}>
                        <div className="space-y-2">
                            <Label htmlFor="create-name">Name</Label>
                            <Input
                                autoComplete="off"
                                id="create-name"
                                onChange={(e) => setCreateName(e.target.value)}
                                required
                                value={createName}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-email">Email</Label>
                            <Input
                                autoComplete="off"
                                id="create-email"
                                onChange={(e) => setCreateEmail(e.target.value)}
                                required
                                type="email"
                                value={createEmail}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-password">Password</Label>
                            <Input
                                autoComplete="new-password"
                                id="create-password"
                                minLength={8}
                                onChange={(e) =>
                                    setCreatePassword(e.target.value)
                                }
                                required
                                type="password"
                                value={createPassword}
                            />
                            <p className="text-muted-foreground text-xs">
                                At least 8 characters.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={createIsAdmin}
                                id="create-admin"
                                onCheckedChange={(checked) =>
                                    setCreateIsAdmin(checked === true)
                                }
                            />
                            <Label htmlFor="create-admin">
                                Grant admin access
                            </Label>
                        </div>
                        <Button
                            disabled={createLocalUser.isPending}
                            type="submit"
                        >
                            {createLocalUser.isPending
                                ? "Creating..."
                                : "Create User"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog
                onOpenChange={(open) => {
                    if (!open) closeEditDialog();
                }}
                open={editUser !== null}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit {editUser?.name}</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleUpdateUser}>
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input
                                id="edit-name"
                                onChange={(e) => setEditName(e.target.value)}
                                required
                                value={editName}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-email">Email</Label>
                            <Input
                                id="edit-email"
                                onChange={(e) => setEditEmail(e.target.value)}
                                required
                                type="email"
                                value={editEmail}
                            />
                        </div>
                        <Button disabled={updateUser.isPending} type="submit">
                            {updateUser.isPending ? "Saving..." : "Save"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Set Password Dialog */}
            <Dialog
                onOpenChange={(open) => {
                    if (!open) closePasswordDialog();
                }}
                open={passwordUser !== null}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {passwordUser?.hasPassword
                                ? "Reset password"
                                : "Set local password"}{" "}
                            for {passwordUser?.name}
                        </DialogTitle>
                        <DialogDescription>
                            The user's other sessions are signed out.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleSetPassword}>
                        <div className="space-y-2">
                            <Label htmlFor="set-password">New password</Label>
                            <Input
                                autoComplete="new-password"
                                id="set-password"
                                minLength={8}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                type="password"
                                value={newPassword}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="set-password-confirm">
                                Confirm password
                            </Label>
                            <Input
                                autoComplete="new-password"
                                id="set-password-confirm"
                                minLength={8}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                required
                                type="password"
                                value={confirmPassword}
                            />
                        </div>
                        <Button
                            disabled={setUserPassword.isPending}
                            type="submit"
                        >
                            {setUserPassword.isPending
                                ? "Saving..."
                                : "Set Password"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
