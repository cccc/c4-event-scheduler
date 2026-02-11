"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

export default function EventTypesPage() {
	const [open, setOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editingType, setEditingType] = useState<{
		id: string;
		slug: string;
		name: string;
		description: string | null;
		color: string | null;
		spaceId: string | null;
	} | null>(null);

	const utils = api.useUtils();
	const { data: session } = authClient.useSession();

	const { data: eventTypes, isLoading } = api.eventTypes.list.useQuery({});
	const { data: spaces } = api.spaces.list.useQuery({ includePrivate: true });

	const createEventType = api.eventTypes.create.useMutation({
		onSuccess: () => {
			utils.eventTypes.list.invalidate();
			setOpen(false);
		},
	});

	const updateEventType = api.eventTypes.update.useMutation({
		onSuccess: () => {
			utils.eventTypes.list.invalidate();
			setEditOpen(false);
			setEditingType(null);
		},
	});

	const deleteEventType = api.eventTypes.delete.useMutation({
		onSuccess: () => {
			utils.eventTypes.list.invalidate();
		},
	});

	const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const spaceId = formData.get("spaceId") as string;
		createEventType.mutate({
			name: formData.get("name") as string,
			slug: formData.get("slug") as string,
			description: (formData.get("description") as string) || undefined,
			color: (formData.get("color") as string) || undefined,
			spaceId: spaceId || undefined,
		});
	};

	const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!editingType) return;

		const formData = new FormData(e.currentTarget);
		updateEventType.mutate({
			id: editingType.id,
			name: formData.get("name") as string,
			description: (formData.get("description") as string) || undefined,
			color: (formData.get("color") as string) || undefined,
		});
	};

	const handleDelete = (id: string) => {
		if (confirm("Are you sure you want to delete this event type?")) {
			deleteEventType.mutate({ id });
		}
	};

	const isLoggedIn = !!session?.user;

	return (
		<>
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="mb-2 font-bold text-3xl">Event Types</h1>
					<p className="text-muted-foreground">
						Event types are templates for categorizing events (e.g., "Meetup",
						"Workshop", "Conference").
					</p>
				</div>

				{isLoggedIn && (
					<Dialog onOpenChange={setOpen} open={open}>
						<DialogTrigger asChild>
							<Button>Create Event Type</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Create Event Type</DialogTitle>
							</DialogHeader>
							<form className="space-y-4" onSubmit={handleCreate}>
								<div>
									<Label htmlFor="name">Name</Label>
									<Input
										id="name"
										name="name"
										placeholder="e.g., User Group Meetup"
										required
									/>
								</div>
								<div>
									<Label htmlFor="slug">Slug</Label>
									<Input
										id="slug"
										name="slug"
										pattern="[a-z0-9-]+"
										placeholder="e.g., user-group-meetup"
										required
									/>
								</div>
								<div>
									<Label htmlFor="description">Description</Label>
									<Input id="description" name="description" />
								</div>
								<div>
									<Label htmlFor="color">Color</Label>
									<Input
										defaultValue="#3788d8"
										id="color"
										name="color"
										type="color"
									/>
								</div>
								<div>
									<Label htmlFor="spaceId">Limit to Space (optional)</Label>
									<select
										className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
										id="spaceId"
										name="spaceId"
									>
										<option value="">Global (available in all spaces)</option>
										{spaces?.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
									</select>
								</div>
								<Button disabled={createEventType.isPending} type="submit">
									{createEventType.isPending ? "Creating..." : "Create"}
								</Button>
							</form>
						</DialogContent>
					</Dialog>
				)}
			</div>

			{isLoading ? (
				<p>Loading...</p>
			) : (
				<div className="space-y-2">
					{eventTypes?.map((et) => (
						<div
							className="flex items-center justify-between rounded-lg border p-4"
							key={et.id}
						>
							<div className="flex items-center gap-3">
								{et.color && (
									<span
										className="h-4 w-4 rounded-full"
										style={{ backgroundColor: et.color }}
									/>
								)}
								<div>
									<div className="flex items-center gap-2">
										<span className="font-medium">{et.name}</span>
										{et.spaceId ? (
											<span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
												{et.space?.name ?? "Space"}
											</span>
										) : (
											<span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs">
												Global
											</span>
										)}
									</div>
									<div className="text-muted-foreground text-sm">
										/{et.slug}
									</div>
									{et.description && (
										<div className="mt-1 text-muted-foreground text-sm">
											{et.description}
										</div>
									)}
								</div>
							</div>
							{isLoggedIn && (
								<div className="flex gap-2">
									<Button
										onClick={() => {
											setEditingType({
												id: et.id,
												slug: et.slug,
												name: et.name,
												description: et.description,
												color: et.color,
												spaceId: et.spaceId,
											});
											setEditOpen(true);
										}}
										size="sm"
										variant="outline"
									>
										Edit
									</Button>
									<Button
										onClick={() => handleDelete(et.id)}
										size="sm"
										variant="outline"
									>
										Delete
									</Button>
								</div>
							)}
						</div>
					))}

					{eventTypes?.length === 0 && (
						<p className="text-muted-foreground">
							No event types yet. {isLoggedIn && "Create one to get started."}
						</p>
					)}
				</div>
			)}

			{/* Edit Dialog */}
			<Dialog onOpenChange={setEditOpen} open={editOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Event Type</DialogTitle>
					</DialogHeader>
					{editingType && (
						<form className="space-y-4" onSubmit={handleEdit}>
							<div>
								<Label htmlFor="edit-name">Name</Label>
								<Input
									defaultValue={editingType.name}
									id="edit-name"
									name="name"
									required
								/>
							</div>
							<div>
								<Label htmlFor="edit-description">Description</Label>
								<Input
									defaultValue={editingType.description ?? ""}
									id="edit-description"
									name="description"
								/>
							</div>
							<div>
								<Label htmlFor="edit-color">Color</Label>
								<Input
									defaultValue={editingType.color ?? "#3788d8"}
									id="edit-color"
									name="color"
									type="color"
								/>
							</div>
							{editingType.spaceId && (
								<p className="text-muted-foreground text-sm">
									This event type is limited to a specific space and cannot be
									made global.
								</p>
							)}
							<Button disabled={updateEventType.isPending} type="submit">
								{updateEventType.isPending ? "Saving..." : "Save Changes"}
							</Button>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
