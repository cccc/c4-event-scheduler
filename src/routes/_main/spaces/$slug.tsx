import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { SpaceCalendar } from "@/components/space-calendar";
import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/spaces/$slug")({
    loader: async ({ context, params }) => {
        const space = await context.queryClient.ensureQueryData(
            spacesQueries.getBySlug(params.slug),
        );
        if (!space) throw notFound();
    },
    component: SpaceDetailPage,
});

function SpaceDetailPage() {
    const { slug } = Route.useParams();
    const { data: space } = useSuspenseQuery(spacesQueries.getBySlug(slug));

    // The loader throws notFound() for null; this just narrows the type.
    if (!space) return null;

    return <SpaceCalendar space={space} />;
}
