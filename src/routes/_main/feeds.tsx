import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { type FeedAccess, SubscribeMenu } from "@/components/subscribe-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/feeds")({
    // Prefetch so the feed lists render on the server
    loader: ({ context }) =>
        Promise.all([
            context.queryClient.ensureQueryData(
                spacesQueries.list({ includePrivate: !!context.session?.user }),
            ),
            context.queryClient.ensureQueryData(eventTypesQueries.list({})),
        ]),
    component: FeedsPage,
});

/** Marks feeds that only contain events once a feed token is supplied. */
function InternalFeedBadge() {
    return (
        <Badge className="ml-2 align-middle" variant="outline">
            Internal, token required
        </Badge>
    );
}

function FeedRow({
    name,
    url,
    access,
    badge = access === "internal",
    compact,
}: {
    name: string;
    url: string;
    /** What the feed contains with and without a token; drives the menu */
    access: FeedAccess;
    /** Whether to show the Internal tag (a section heading may carry it instead) */
    badge?: boolean;
    compact?: boolean;
}) {
    return (
        <div
            className={
                compact
                    ? "flex items-center justify-between rounded border p-2"
                    : "flex items-center justify-between rounded-lg border p-4"
            }
        >
            <div>
                <div className={compact ? "text-sm" : "font-medium"}>
                    {name}
                    {badge && <InternalFeedBadge />}
                </div>
                <code
                    className={
                        compact
                            ? "text-muted-foreground text-xs"
                            : "text-muted-foreground text-sm"
                    }
                >
                    {url}
                </code>
            </div>
            <SubscribeMenu access={access} compact={compact} url={url} />
        </div>
    );
}

/** Explains, to signed-in users only, how to get internal events into a feed. */
function ApiKeyNote() {
    return (
        <Alert>
            <AlertTitle>Internal events in feeds</AlertTitle>
            <AlertDescription className="space-y-2">
                <p>
                    Feeds are public by default: internal event types, private
                    spaces and drafts are left out. The Subscribe menus below
                    also offer every feed <em>including internal events</em>.
                    Those links carry your personal feed token (shown under{" "}
                    <Link className="underline" to="/account">
                        Account
                    </Link>
                    ), which only works for feeds; treat such links like a
                    password. Drafts never appear. Feeds tagged{" "}
                    <em>Internal</em> only exist with a token.
                </p>
                <p>
                    Each menu offers a <code>webcal:</code> link that opens your
                    calendar app directly, and the plain URL. A feed URL with an
                    invalid token returns an error instead of silently falling
                    back to the public events.
                </p>
                <p className="text-muted-foreground">
                    Integrations that already use the REST API can alternatively
                    authenticate feeds with their API key; see the API
                    documentation.
                </p>
            </AlertDescription>
        </Alert>
    );
}

function FeedsPage() {
    const { session, appUrl } = Route.useRouteContext();
    const isLoggedIn = !!session?.user;
    const { data: spaces } = useSuspenseQuery(
        spacesQueries.list({ includePrivate: isLoggedIn }),
    );
    // Internal event types are only returned for signed-in users
    const { data: eventTypes } = useSuspenseQuery(eventTypesQueries.list({}));

    return (
        <>
            <PageHeader
                description="Subscribe to calendar feeds using any calendar application that supports iCal (Google Calendar, Apple Calendar, Outlook, etc.)."
                title="iCal Feeds"
            />

            <div className="space-y-8">
                {isLoggedIn && <ApiKeyNote />}

                <section>
                    <h2 className="mb-4 font-semibold text-xl">All Events</h2>
                    <FeedRow
                        access="mixed"
                        name="All events"
                        url={`${appUrl}/api/cal/all.ics`}
                    />
                </section>

                <section>
                    <h2 className="mb-4 font-semibold text-xl">
                        By Event Type
                    </h2>
                    <p className="mb-4 text-muted-foreground text-sm">
                        One event type across every space.
                    </p>
                    <div className="space-y-2">
                        {eventTypes
                            ?.filter((et) => et.spaceId === null)
                            .map((et) => (
                                <FeedRow
                                    access={
                                        et.isInternal ? "internal" : "mixed"
                                    }
                                    key={et.id}
                                    name={et.name}
                                    url={`${appUrl}/api/cal/all/${et.slug}.ics`}
                                />
                            ))}
                    </div>
                </section>

                <section>
                    <h2 className="mb-4 font-semibold text-xl">By Space</h2>
                    <div className="space-y-2">
                        {spaces.map((space) => (
                            <FeedRow
                                access={space.isPublic ? "mixed" : "internal"}
                                key={space.id}
                                name={space.name}
                                url={`${appUrl}/api/cal/${space.slug}.ics`}
                            />
                        ))}
                        {spaces.length === 0 && (
                            <p className="text-muted-foreground">
                                No spaces available.
                            </p>
                        )}
                    </div>
                </section>

                <section>
                    <h2 className="mb-4 font-semibold text-xl">
                        By Space and Event Type
                    </h2>
                    <p className="mb-4 text-muted-foreground text-sm">
                        You can filter by event type within a space using the
                        URL pattern:{" "}
                        <code>
                            {appUrl}/api/cal/{"space"}/{"event-type"}.ics
                        </code>
                    </p>
                    <details className="rounded-lg border">
                        <summary className="cursor-pointer p-4 font-medium">
                            Show all combinations
                        </summary>
                        <div className="space-y-4 border-t p-4">
                            {spaces.map((space) => (
                                <div key={space.id}>
                                    {/* The space tag covers all rows below it */}
                                    <h3 className="mb-2 font-medium">
                                        {space.name}
                                        {!space.isPublic && (
                                            <InternalFeedBadge />
                                        )}
                                    </h3>
                                    <div className="space-y-2 pl-4">
                                        {eventTypes.map((et) => (
                                            <FeedRow
                                                access={
                                                    !space.isPublic ||
                                                    et.isInternal
                                                        ? "internal"
                                                        : "public"
                                                }
                                                badge={et.isInternal}
                                                compact
                                                key={et.id}
                                                name={et.name}
                                                url={`${appUrl}/api/cal/${space.slug}/${et.slug}.ics`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </details>
                </section>
            </div>
        </>
    );
}
