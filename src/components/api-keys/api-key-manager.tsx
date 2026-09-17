import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SecretInput } from "@/components/secret-input";
import { useAppTimezone } from "@/components/timezone-provider";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import { formatShortDate } from "@/lib/format-date";
import { formatPermissionScope } from "@/lib/format-permission";
import {
    type Capabilities,
    capabilitiesGrant,
    type Permission,
} from "@/lib/permissions-core";
import { apiKeysKeys } from "@/lib/queries/api-keys";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { spacesQueries } from "@/lib/queries/spaces";
import { usersKeys } from "@/lib/queries/users";
import {
    addPermission as addPermissionFn,
    create as createApiKeyFn,
    deleteApiKey as deleteApiKeyFn,
    removePermission as removePermissionFn,
    update as updateApiKeyFn,
} from "@/server/fns/api-keys";

export type ApiKeyView = {
    id: string;
    name: string;
    keyFingerprint: string;
    isAdmin: boolean;
    isActive: boolean;
    createdAt: Date;
    lastUsedAt: Date | null;
    userId: string | null;
    permissions: Array<Permission & { id: string }>;
    owner: {
        id: string;
        name: string;
        email: string;
        capabilities: Capabilities;
    } | null;
};

// Everything the current caller may hand out (admins: anything)
export const ADMIN_CAPABILITIES: Capabilities = {
    isAdmin: true,
    permissions: [],
};

function useApiKeyMutations() {
    const queryClient = useQueryClient();
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: apiKeysKeys.all });
        queryClient.invalidateQueries({ queryKey: usersKeys.all });
    };
    const onError = (error: Error) => toast.error(error.message);
    return {
        invalidate,
        update: useMutation({
            mutationFn: (input: Parameters<typeof updateApiKeyFn>[0]["data"]) =>
                updateApiKeyFn({ data: input }),
            onSuccess: invalidate,
            onError,
        }),
        remove: useMutation({
            mutationFn: (input: { id: string }) =>
                deleteApiKeyFn({ data: input }),
            onSuccess: invalidate,
            onError,
        }),
        addPermission: useMutation({
            mutationFn: (
                input: Parameters<typeof addPermissionFn>[0]["data"],
            ) => addPermissionFn({ data: input }),
            onSuccess: invalidate,
            onError,
        }),
        removePermission: useMutation({
            mutationFn: (input: { id: string }) =>
                removePermissionFn({ data: input }),
            onSuccess: invalidate,
            onError,
        }),
    };
}

type ApiKeyListProps = {
    keys: ApiKeyView[];
    /** Bound for keys without an owner (an owner's capabilities win otherwise) */
    capabilities: Capabilities;
    showOwner?: boolean;
    emptyText: string;
};

/** Key cards with revoke/delete and permission management; shared by the admin page and the account page. */
export function ApiKeyList({
    keys,
    capabilities,
    showOwner,
    emptyText,
}: ApiKeyListProps) {
    const tz = useAppTimezone();
    const m = useApiKeyMutations();
    const [permKey, setPermKey] = useState<ApiKeyView | null>(null);

    if (keys.length === 0) {
        return <p className="text-muted-foreground text-sm">{emptyText}</p>;
    }

    return (
        <div className="space-y-4">
            {keys.map((key) => (
                <div className="rounded-lg border p-4" key={key.id}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{key.name}</span>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                                {key.keyFingerprint}
                            </code>
                            {showOwner && key.owner && (
                                <Badge variant="secondary">
                                    {key.owner.name}
                                </Badge>
                            )}
                            {key.isAdmin && (
                                <Badge variant="default">Admin</Badge>
                            )}
                            {!key.isActive && (
                                <Badge variant="destructive">Revoked</Badge>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground text-xs">
                                {key.lastUsedAt
                                    ? `Last used ${formatShortDate(new Date(key.lastUsedAt), tz)}`
                                    : "Never used"}
                            </span>
                            <Button
                                onClick={() => setPermKey(key)}
                                size="sm"
                                variant="outline"
                            >
                                Add Permission
                            </Button>
                            <Button
                                onClick={() => {
                                    if (
                                        confirm(
                                            `${key.isActive ? "Revoke" : "Reactivate"} this key?`,
                                        )
                                    ) {
                                        m.update.mutate({
                                            id: key.id,
                                            isActive: !key.isActive,
                                        });
                                    }
                                }}
                                size="sm"
                                variant={key.isActive ? "outline" : "secondary"}
                            >
                                {key.isActive ? "Revoke" : "Reactivate"}
                            </Button>
                            <Button
                                onClick={() => {
                                    if (
                                        confirm(
                                            "Permanently delete this API key? This cannot be undone.",
                                        )
                                    ) {
                                        m.remove.mutate({ id: key.id });
                                    }
                                }}
                                size="sm"
                                variant="destructive"
                            >
                                Delete
                            </Button>
                        </div>
                    </div>

                    <div className="mb-2 text-muted-foreground text-xs">
                        Created {formatShortDate(new Date(key.createdAt), tz)}
                        {key.owner &&
                            ` · acts as ${key.owner.name}; both the key and ${key.owner.name} must allow an action`}
                    </div>

                    {key.isAdmin || key.permissions.length > 0 ? (
                        <div className="space-y-1">
                            {key.isAdmin && (
                                <div className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
                                    <span className="text-muted-foreground">
                                        Admin: unlimited access to all spaces
                                        and event types
                                    </span>
                                    <Button
                                        onClick={() => {
                                            if (
                                                confirm(
                                                    "Remove admin access from this key?",
                                                )
                                            ) {
                                                m.update.mutate({
                                                    id: key.id,
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
                            {key.permissions.map((perm) => (
                                <div
                                    className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm"
                                    key={perm.id}
                                >
                                    <span>{formatPermissionScope(perm)}</span>
                                    <Button
                                        onClick={() => {
                                            if (
                                                confirm(
                                                    "Remove this permission?",
                                                )
                                            ) {
                                                m.removePermission.mutate({
                                                    id: perm.id,
                                                });
                                            }
                                        }}
                                        size="sm"
                                        variant="ghost"
                                    >
                                        Remove
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm">
                            No permissions: this key can read what its owner can
                            see but not change anything.
                        </p>
                    )}
                </div>
            ))}

            <AddPermissionDialog
                bound={permKey?.owner?.capabilities ?? capabilities}
                keyRecord={permKey}
                onClose={() => setPermKey(null)}
                onGrantAdmin={(id) =>
                    m.update.mutate(
                        { id, isAdmin: true },
                        { onSuccess: () => setPermKey(null) },
                    )
                }
                onSubmit={(input) =>
                    m.addPermission.mutate(input, {
                        onSuccess: () => setPermKey(null),
                    })
                }
                pending={m.update.isPending || m.addPermission.isPending}
            />
        </div>
    );
}

type ScopeType = "admin" | "global" | "space" | "eventType" | "scoped";

type ScopePick = { admin: true } | Permission;

type ScopePickerProps = {
    /** What may be granted: for personal keys the owner's capabilities */
    bound: Capabilities;
    /** Offer "Admin access" (bound must allow it and the key must not have it) */
    allowAdmin: boolean;
    pending?: boolean;
    submitLabel: string;
    onPick: (pick: ScopePick) => void;
};

/**
 * Scope chooser shared by the create and add-permission dialogs. Only
 * scopes within the bound are offered; custom slugs (for spaces or types
 * that do not exist yet) only to admins. Not a form, so it can nest.
 */
function ScopePicker({
    bound,
    allowAdmin,
    pending,
    submitLabel,
    onPick,
}: ScopePickerProps) {
    const canGlobal = capabilitiesGrant(bound, {});
    const [scopeType, setScopeType] = useState<ScopeType>(
        canGlobal ? "global" : "space",
    );
    const [spaceSlug, setSpaceSlug] = useState("");
    const [customSpace, setCustomSpace] = useState("");
    const [eventTypeSlug, setEventTypeSlug] = useState("");
    const [customType, setCustomType] = useState("");
    const { data: spaces } = useQuery(spacesQueries.list());
    const { data: eventTypes } = useQuery(eventTypesQueries.list({}));

    const spaceOptions = (spaces ?? []).filter(
        (s) =>
            capabilitiesGrant(bound, { spaceSlug: s.slug }) ||
            bound.permissions.some((p) => p.spaceSlug === s.slug),
    );
    const typeOptions = (eventTypes ?? []).filter(
        (t) =>
            capabilitiesGrant(bound, { eventTypeSlug: t.slug }) ||
            bound.permissions.some((p) => p.eventTypeSlug === t.slug),
    );
    const allowCustom = bound.isAdmin;
    const needsSpace = scopeType === "space" || scopeType === "scoped";
    const needsType = scopeType === "eventType" || scopeType === "scoped";
    const pickedSpace = spaceSlug === "custom" ? customSpace : spaceSlug;
    const pickedType = eventTypeSlug === "custom" ? customType : eventTypeSlug;
    const complete =
        scopeType === "admin" ||
        scopeType === "global" ||
        ((!needsSpace || pickedSpace) && (!needsType || pickedType));

    const submit = () => {
        if (scopeType === "admin") {
            onPick({ admin: true });
            return;
        }
        onPick({
            spaceSlug: needsSpace ? pickedSpace : null,
            eventTypeSlug: needsType ? pickedType : null,
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <Label>Permission Scope</Label>
                <Select
                    onValueChange={(v) => setScopeType(v as ScopeType)}
                    value={scopeType}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {allowAdmin && bound.isAdmin && (
                            <SelectItem value="admin">
                                Admin Access (full access)
                            </SelectItem>
                        )}
                        {canGlobal && (
                            <SelectItem value="global">
                                Global (all spaces & event types)
                            </SelectItem>
                        )}
                        <SelectItem value="space">Specific Space</SelectItem>
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
                    Grants this key unlimited access to all spaces and event
                    types, bypassing all permission checks.
                </p>
            )}

            {needsSpace && (
                <div>
                    <Label>Space</Label>
                    <Select onValueChange={setSpaceSlug} value={spaceSlug}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a space" />
                        </SelectTrigger>
                        <SelectContent>
                            {spaceOptions.map((s) => (
                                <SelectItem key={s.id} value={s.slug}>
                                    {s.name} ({s.slug})
                                </SelectItem>
                            ))}
                            {allowCustom && (
                                <SelectItem value="custom">
                                    Enter custom slug...
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    {spaceSlug === "custom" && (
                        <Input
                            className="mt-2"
                            onChange={(e) => setCustomSpace(e.target.value)}
                            pattern="[a-z0-9-]+"
                            placeholder="Custom space slug"
                            value={customSpace}
                        />
                    )}
                </div>
            )}

            {needsType && (
                <div>
                    <Label>Event Type</Label>
                    <Select
                        onValueChange={setEventTypeSlug}
                        value={eventTypeSlug}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select an event type" />
                        </SelectTrigger>
                        <SelectContent>
                            {typeOptions.map((et) => (
                                <SelectItem key={et.id} value={et.slug}>
                                    {et.name} ({et.slug})
                                </SelectItem>
                            ))}
                            {allowCustom && (
                                <SelectItem value="custom">
                                    Enter custom slug...
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    {eventTypeSlug === "custom" && (
                        <Input
                            className="mt-2"
                            onChange={(e) => setCustomType(e.target.value)}
                            pattern="[a-z0-9-]+"
                            placeholder="Custom event type slug"
                            value={customType}
                        />
                    )}
                </div>
            )}

            <Button
                disabled={pending || !complete}
                onClick={submit}
                type="button"
                variant={submitLabel === "Add" ? "outline" : "default"}
            >
                {pending
                    ? "Saving..."
                    : scopeType === "admin"
                      ? "Grant Admin Access"
                      : submitLabel}
            </Button>
        </div>
    );
}

type AddPermissionDialogProps = {
    keyRecord: ApiKeyView | null;
    /** What may be granted: for personal keys the owner's capabilities */
    bound: Capabilities;
    pending: boolean;
    onClose: () => void;
    onGrantAdmin: (id: string) => void;
    onSubmit: (input: {
        apiKeyId: string;
        spaceSlug: string | null;
        eventTypeSlug: string | null;
    }) => void;
};

function AddPermissionDialog({
    keyRecord,
    bound,
    pending,
    onClose,
    onGrantAdmin,
    onSubmit,
}: AddPermissionDialogProps) {
    return (
        <Dialog onOpenChange={(open) => !open && onClose()} open={!!keyRecord}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        Add Permission for {keyRecord?.name}
                    </DialogTitle>
                    {keyRecord?.owner && (
                        <DialogDescription>
                            Limited to what {keyRecord.owner.name} may access.
                        </DialogDescription>
                    )}
                </DialogHeader>
                {keyRecord && (
                    <ScopePicker
                        allowAdmin={!keyRecord.isAdmin}
                        bound={bound}
                        onPick={(pick) => {
                            if ("admin" in pick) onGrantAdmin(keyRecord.id);
                            else onSubmit({ apiKeyId: keyRecord.id, ...pick });
                        }}
                        pending={pending}
                        submitLabel="Add Permission"
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

type CreateApiKeyDialogProps = {
    open: boolean;
    onClose: () => void;
    /** Personal key owned by the caller, or a service key (admins only) */
    personal: boolean;
    /** Bound for the admin flag and the grantable scopes */
    capabilities: Capabilities;
};

/** Create dialog with the full permission setup; shows the secret exactly once. */
export function CreateApiKeyDialog({
    open,
    onClose,
    personal,
    capabilities,
}: CreateApiKeyDialogProps) {
    const { invalidate } = useApiKeyMutations();
    const [name, setName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

    const create = useMutation({
        mutationFn: (input: Parameters<typeof createApiKeyFn>[0]["data"]) =>
            createApiKeyFn({ data: input }),
        onSuccess: (data) => {
            invalidate();
            setNewKeyValue(data.rawKey);
        },
        onError: (error) => toast.error(error.message),
    });

    const close = () => {
        setNewKeyValue(null);
        setName("");
        setIsAdmin(false);
        setPermissions([]);
        onClose();
    };

    const addPick = (pick: ScopePick) => {
        if ("admin" in pick) {
            setIsAdmin(true);
            return;
        }
        const exists = permissions.some(
            (p) =>
                p.spaceSlug === pick.spaceSlug &&
                p.eventTypeSlug === pick.eventTypeSlug,
        );
        if (!exists) setPermissions([...permissions, pick]);
    };

    const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        create.mutate({
            name: name.trim(),
            isAdmin,
            personal,
            permissions,
        });
    };

    return (
        <Dialog onOpenChange={(o) => !o && close()} open={open}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {newKeyValue ? "API Key Created" : "Create API Key"}
                    </DialogTitle>
                    {!newKeyValue && personal && (
                        <DialogDescription>
                            The key can only do what its permissions and yours
                            both allow.
                        </DialogDescription>
                    )}
                </DialogHeader>

                {newKeyValue ? (
                    <div className="space-y-4">
                        <Alert variant="warning">
                            <AlertTitle>
                                This key will not be shown again. Copy it now.
                            </AlertTitle>
                        </Alert>
                        <SecretInput
                            label="API key"
                            prefix="c4k_"
                            value={newKeyValue}
                        />
                        <div className="flex justify-end">
                            <Button onClick={close} type="button">
                                Done
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form className="space-y-6" onSubmit={handleCreate}>
                        <div>
                            <Label htmlFor="name">Key Name</Label>
                            <Input
                                id="name"
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. My Integration"
                                required
                                value={name}
                            />
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <h4 className="font-medium text-sm">Permissions</h4>
                            {isAdmin || permissions.length > 0 ? (
                                <div className="space-y-1">
                                    {isAdmin && (
                                        <div className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
                                            <span className="text-muted-foreground">
                                                Admin: unlimited access to all
                                                spaces and event types
                                            </span>
                                            <Button
                                                onClick={() =>
                                                    setIsAdmin(false)
                                                }
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    )}
                                    {permissions.map((perm) => (
                                        <div
                                            className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm"
                                            key={`${perm.spaceSlug}/${perm.eventTypeSlug}`}
                                        >
                                            <span>
                                                {formatPermissionScope(perm)}
                                            </span>
                                            <Button
                                                onClick={() =>
                                                    setPermissions(
                                                        permissions.filter(
                                                            (p) => p !== perm,
                                                        ),
                                                    )
                                                }
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    No permissions yet: the key could read what
                                    its owner can see but not change anything.
                                </p>
                            )}
                            <ScopePicker
                                allowAdmin={!isAdmin}
                                bound={capabilities}
                                onPick={addPick}
                                submitLabel="Add"
                            />
                        </div>

                        <Button disabled={create.isPending} type="submit">
                            {create.isPending ? "Creating..." : "Create Key"}
                        </Button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
