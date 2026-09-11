import { createFileRoute, redirect } from "@tanstack/react-router";

import { spacesQueries } from "@/lib/queries/spaces";

/**
 * The home page is a redirect: to the default space's calendar when one is
 * set and visible to the visitor, otherwise to the space list.
 */
export const Route = createFileRoute("/_main/")({
    beforeLoad: async ({ context }) => {
        const spaces = await context.queryClient.ensureQueryData(
            spacesQueries.list({ includePrivate: !!context.session?.user }),
        );
        const featured = spaces.find((s) => s.isDefault);
        throw redirect(
            featured
                ? { to: "/spaces/$slug", params: { slug: featured.slug } }
                : { to: "/spaces" },
        );
    },
});
