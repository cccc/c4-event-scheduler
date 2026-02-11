"use client";

import Link from "next/link";
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

export default function SpacesPage() {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: session } = authClient.useSession();

	const { data: spaces, isLoading } = api.spaces.list.useQuery({
		includePrivate: !!session?.user,
	});

	const createSpace = api.spaces.create.useMutation({
		onSuccess: () => {
			utils.spaces.list.invalidate();
			setOpen(false);
		},
	});

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		createSpace.mutate({
			name: formData.get("name") as string,
			slug: formData.get("slug") as string,
			description: (formData.get("description") as string) || undefined,
			isPublic: formData.get("isPublic") === "on",
		});
	};

	const isLoggedIn = !!session?.user;

	return (
		<>
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="mb-2 font-bold text-3xl">Spaces</h1>
					<p className="text-muted-foreground">
						Manage calendar spaces for different venues or communities.
					</p>
				</div>

				{isLoggedIn && (
					<Dialog onOpenChange={setOpen} open={open}>
						<DialogTrigger asChild>
							<Button>Create Space</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Create Space</DialogTitle>
							</DialogHeader>
							<form className="space-y-4" onSubmit={handleSubmit}>
								<div>
									<Label htmlFor="name">Name</Label>
									<Input id="name" name="name" required />
								</div>
								<div>
									<Label htmlFor="slug">Slug</Label>
									<Input
										id="slug"
										name="slug"
										pattern="[a-z0-9-]+"
										placeholder="my-space"
										required
									/>
								</div>
								<div>
									<Label htmlFor="description">Description</Label>
									<Input id="description" name="description" />
								</div>
								<div className="flex items-center gap-2">
									<input
										defaultChecked
										id="isPublic"
										name="isPublic"
										type="checkbox"
									/>
									<Label htmlFor="isPublic">Public</Label>
								</div>
								<Button disabled={createSpace.isPending} type="submit">
									{createSpace.isPending ? "Creating..." : "Create"}
								</Button>
							</form>
						</DialogContent>
					</Dialog>
				)}
			</div>

			{isLoading ? (
				<p>Loading...</p>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{spaces?.map((space) => (
						<Link
							className="block rounded-lg border p-4 transition-colors hover:bg-accent"
							href={`/spaces/${space.slug}`}
							key={space.id}
						>
							<h2 className="mb-1 font-semibold">{space.name}</h2>
							{space.description && (
								<p className="text-muted-foreground text-sm">
									{space.description}
								</p>
							)}
							<div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
								<span>/{space.slug}</span>
								{!space.isPublic && (
									<span className="rounded bg-muted px-1">Private</span>
								)}
							</div>
						</Link>
					))}

					{spaces?.length === 0 && (
						<p className="text-muted-foreground">
							No spaces yet. {isLoggedIn && "Create one to get started."}
						</p>
					)}
				</div>
			)}
		</>
	);
}
