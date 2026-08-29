import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/")({
    loader: ({ context }) =>
        context.queryClient.ensureQueryData(
            spacesQueries.list({ includePrivate: false }),
        ),
    component: HomePage,
});

function HomePage() {
    const { data: spaces } = useSuspenseQuery(
        spacesQueries.list({ includePrivate: false }),
    );

    return (
        <>
            <div className="mb-8">
                <h1 className="mb-2 font-bold text-3xl">Event Calendar</h1>
                <p className="text-muted-foreground">
                    Browse events across all spaces or select a specific space
                    below.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {spaces.map((space) => (
                    <Link
                        className="block rounded-lg border p-4 transition-colors hover:bg-accent"
                        key={space.id}
                        params={{ slug: space.slug }}
                        to="/spaces/$slug"
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
        </>
    );
}
