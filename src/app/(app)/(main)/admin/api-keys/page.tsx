"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
};

type ApiKeyRecord = {
	id: string;
	name: string;
	keyFingerprint: string;
	isAdmin: boolean;
	isActive: boolean;
	createdAt: Date;
	lastUsedAt: Date | null;
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

export default function AdminApiKeysPage() {
	const [createOpen, setCreateOpen] = useState(false);
	const [addPermOpen, setAddPermOpen] = useState(false);
	const [selectedKey, setSelectedKey] = useState<ApiKeyRecord | null>(null);
	const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
	const [scopeType, setScopeType] = useState<
		"admin" | "global" | "space" | "eventType" | "scoped"
	>("global");
	const [copied, setCopied] = useState(false);
	const [newKeyIsAdmin, setNewKeyIsAdmin] = useState(false);

	const utils = api.useUtils();

	const { data: isAdmin, isLoading: isAdminLoading } =
		api.roles.isAdmin.useQuery();
	const { data: keys, isLoading: keysLoading } = api.apiKeys.list.useQuery(
		undefined,
		{ enabled: isAdmin },
	);
	const { data: spaces } = api.roles.listSpaces.useQuery(undefined, {
		enabled: isAdmin,
	});
	const { data: eventTypes } = api.roles.listEventTypes.useQuery(undefined, {
		enabled: isAdmin,
	});

	const createKey = api.apiKeys.create.useMutation({
		onSuccess: (data) => {
			utils.apiKeys.list.invalidate();
			setNewKeyValue(data.rawKey);
		},
	});

	const updateKey = api.apiKeys.update.useMutation({
		onSuccess: () => utils.apiKeys.list.invalidate(),
	});

	const deleteKey = api.apiKeys.delete.useMutation({
		onSuccess: () => utils.apiKeys.list.invalidate(),
	});

	const addPermission = api.apiKeys.addPermission.useMutation({
		onSuccess: () => {
			utils.apiKeys.list.invalidate();
			closeAddPermDialog();
		},
	});

	const removePermission = api.apiKeys.removePermission.useMutation({
		onSuccess: () => utils.apiKeys.list.invalidate(),
	});

	const closeAddPermDialog = () => {
		setAddPermOpen(false);
		setSelectedKey(null);
		setScopeType("global");
	};

	const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		createKey.mutate({
			name: formData.get("name") as string,
			isAdmin: newKeyIsAdmin,
		});
	};

	const handleAddPermission = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!selectedKey) return;

		if (scopeType === "admin") {
			updateKey.mutate(
				{ id: selectedKey.id, isAdmin: true },
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
			apiKeyId: selectedKey.id,
			spaceSlug,
			eventTypeSlug,
		});
	};

	const handleCopy = async () => {
		if (!newKeyValue) return;
		await navigator.clipboard.writeText(newKeyValue);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleCloseCreate = () => {
		setCreateOpen(false);
		setNewKeyValue(null);
		setCopied(false);
	};

	if (isAdminLoading) return <p>Loading...</p>;

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
		scopeType === "admin" ? updateKey.isPending : addPermission.isPending;

	return (
		<>
			<div className="mb-8 flex items-start justify-between">
				<div>
					<h1 className="mb-2 font-bold text-3xl">API Key Management</h1>
					<p className="text-muted-foreground">
						Manage machine-to-machine API keys for the REST API.
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>Create API Key</Button>
			</div>

			{keysLoading ? (
				<p>Loading keys...</p>
			) : (
				<div className="space-y-4">
					{keys?.map((key) => (
						<div className="rounded-lg border p-4" key={key.id}>
							<div className="mb-3 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<span className="font-medium">{key.name}</span>
									<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
										{key.keyFingerprint}
									</code>
									{key.isAdmin && <Badge variant="default">Admin</Badge>}
									{!key.isActive && (
										<Badge variant="destructive">Revoked</Badge>
									)}
								</div>
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-xs">
										{key.lastUsedAt
											? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
											: "Never used"}
									</span>
									<Button
										onClick={() => {
											setSelectedKey(key as unknown as ApiKeyRecord);
											setAddPermOpen(true);
										}}
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
												updateKey.mutate({
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
												deleteKey.mutate({ id: key.id });
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
								Created {new Date(key.createdAt).toLocaleDateString()}
							</div>

							{key.isAdmin || key.permissions.length > 0 ? (
								<div className="space-y-1">
									{key.isAdmin && (
										<div className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
											<span className="text-muted-foreground">
												Admin — unlimited access to all spaces and event types
											</span>
											<Button
												onClick={() => {
													if (confirm("Remove admin access from this key?")) {
														updateKey.mutate({ id: key.id, isAdmin: false });
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
													if (confirm("Remove this permission?")) {
														removePermission.mutate({ id: perm.id });
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
									No specific permissions — key cannot access anything.
								</p>
							)}
						</div>
					))}

					{keys?.length === 0 && (
						<p className="text-muted-foreground">No API keys found.</p>
					)}
				</div>
			)}

			{/* Create Key Dialog */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) handleCloseCreate();
					else setCreateOpen(true);
				}}
				open={createOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{newKeyValue ? "API Key Created" : "Create API Key"}
						</DialogTitle>
					</DialogHeader>

					{newKeyValue ? (
						<div className="space-y-4">
							<div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
								<p className="font-medium text-amber-800 text-sm dark:text-amber-200">
									This key will not be shown again. Copy it now.
								</p>
							</div>
							<div className="flex gap-2">
								<code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-sm">
									{newKeyValue}
								</code>
								<Button onClick={handleCopy} variant="outline">
									{copied ? "Copied!" : "Copy"}
								</Button>
							</div>
							<div className="flex justify-end">
								<Button onClick={handleCloseCreate}>Done</Button>
							</div>
						</div>
					) : (
						<form className="space-y-4" onSubmit={handleCreate}>
							<div>
								<Label htmlFor="name">Key Name</Label>
								<Input
									id="name"
									name="name"
									placeholder="e.g. My Integration"
									required
								/>
							</div>
							<div className="flex items-center gap-2">
								<Checkbox
									checked={newKeyIsAdmin}
									id="isAdmin"
									onCheckedChange={(v) => setNewKeyIsAdmin(v === true)}
								/>
								<Label htmlFor="isAdmin">Admin (full access)</Label>
							</div>
							<Button disabled={createKey.isPending} type="submit">
								{createKey.isPending ? "Creating..." : "Create Key"}
							</Button>
						</form>
					)}
				</DialogContent>
			</Dialog>

			{/* Add Permission Dialog */}
			<Dialog onOpenChange={closeAddPermDialog} open={addPermOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Permission for {selectedKey?.name}</DialogTitle>
					</DialogHeader>
					<form className="space-y-4" onSubmit={handleAddPermission}>
						<div>
							<Label>Permission Scope</Label>
							<Select
								onValueChange={(v) =>
									setScopeType(
										v as "admin" | "global" | "space" | "eventType" | "scoped",
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
								Grants this key unlimited access to all spaces and event types,
								bypassing all permission checks.
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
											<SelectItem key={s.id} value={s.slug}>
												{s.name} ({s.slug})
											</SelectItem>
										))}
										<SelectItem value="custom">Enter custom slug...</SelectItem>
									</SelectContent>
								</Select>
								<Input
									className="mt-2"
									name="customSpaceSlug"
									pattern="[a-z0-9-]+"
									placeholder="Custom space slug"
								/>
							</div>
						)}

						{(scopeType === "eventType" || scopeType === "scoped") && (
							<div>
								<Label htmlFor="eventTypeSlug">Event Type</Label>
								<Select name="eventTypeSlug">
									<SelectTrigger>
										<SelectValue placeholder="Select or enter slug" />
									</SelectTrigger>
									<SelectContent>
										{eventTypes?.map((et) => (
											<SelectItem key={et.id} value={et.slug}>
												{et.name} ({et.slug})
											</SelectItem>
										))}
										<SelectItem value="custom">Enter custom slug...</SelectItem>
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
