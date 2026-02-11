import Link from "next/link";

import { api, HydrateClient } from "@/trpc/server";

export default async function HomePage() {
	const spaces = await api.spaces.list({ includePrivate: false });

	return (
		<HydrateClient>
			<div className="mb-8">
				<h1 className="mb-2 font-bold text-3xl">Event Calendar</h1>
				<p className="text-muted-foreground">
					Browse events across all spaces or select a specific space below.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{spaces.map((space) => (
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
						<div className="mt-2 text-muted-foreground text-xs">
							/{space.slug}
						</div>
					</Link>
				))}

				{spaces.length === 0 && (
					<p className="text-muted-foreground">
						No spaces available. Create one to get started.
					</p>
				)}
			</div>
		</HydrateClient>
	);
}
