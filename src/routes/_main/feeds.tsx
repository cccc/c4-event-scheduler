import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { SubscribeMenu } from "@/components/subscribe-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/feeds")({
    component: FeedsPage,
});

/** Marks feeds that only contain events once an API key is supplied. */
function InternalFeedBadge() {
    return (
        <Badge className="ml-2 align-middle" variant="outline">
            Internal, API key required
        </Badge>
    );
}

function FeedRow({
    name,
    url,
    internal,
    compact,
}: {
    name: string;
    url: string;
    internal: boolean;
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
                    {internal && <InternalFeedBadge />}
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
            <SubscribeMenu compact={compact} url={url} />
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
                    spaces and drafts are left out. Supply an API key and the
                    same feeds include internal event types and private spaces
                    (drafts never appear). Feeds tagged <em>Internal</em> below
                    are empty without a key. You can create a personal key under{" "}
                    <Link className="underline" to="/account">
                        Account
                    </Link>
                    .
                </p>
                <p>
                    The Subscribe menus offer a <code>webcal:</code> link that
                    opens your calendar app directly, and the plain URL. The key
                    can be passed in any of these ways:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>
                        Query parameter, for calendar apps that cannot send
                        headers: <code>?key=c4k_…</code>. Leave off the{" "}
                        <code>#fingerprint</code> suffix or encode the{" "}
                        <code>#</code> as <code>%23</code>, otherwise the URL is
                        cut off there. Treat such a URL as a secret.
                    </li>
                    <li>
                        <code>X-Api-Key</code> header.
                    </li>
                    <li>
                        <code>Authorization: Bearer c4k_…</code> header.
                    </li>
                    <li>
                        HTTP Basic auth with the username <code>apikey</code>{" "}
                        and the key as the password, for clients that only offer
                        a username and password field.
                    </li>
                </ul>
                <p>
                    A feed URL with an invalid key returns an error instead of
                    silently falling back to the public events.
                </p>
            </AlertDescription>
        </Alert>
    );
}

function FeedsPage() {
    const { session, appUrl } = Route.useRouteContext();
    const isLoggedIn = !!session?.user;
    const { data: spaces } = useQuery(
        spacesQueries.list({ includePrivate: isLoggedIn }),
    );
    // Internal event types are only returned for signed-in users
    const { data: eventTypes } = useQuery(eventTypesQueries.list({}));

    return (
        <>
            <div className="mb-8">
                <h1 className="mb-2 font-bold text-3xl">iCal Feeds</h1>
                <p className="text-muted-foreground">
                    Subscribe to calendar feeds using any calendar application
                    that supports iCal (Google Calendar, Apple Calendar,
                    Outlook, etc.).
                </p>
            </div>

            <div className="space-y-8">
                {isLoggedIn && <ApiKeyNote />}

                <section>
                    <h2 className="mb-4 font-semibold text-xl">All Events</h2>
                    <FeedRow
                        internal={false}
                        name={
                            isLoggedIn
                                ? "All events (internal ones with an API key)"
                                : "All public events"
                        }
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
                                    internal={et.isInternal}
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
                        {spaces?.map((space) => (
                            <FeedRow
                                internal={!space.isPublic}
                                key={space.id}
                                name={space.name}
                                url={`${appUrl}/api/cal/${space.slug}.ics`}
                            />
                        ))}
                        {spaces?.length === 0 && (
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
                            {spaces?.map((space) => (
                                <div key={space.id}>
                                    {/* The space tag covers all rows below it */}
                                    <h3 className="mb-2 font-medium">
                                        {space.name}
                                        {!space.isPublic && (
                                            <InternalFeedBadge />
                                        )}
                                    </h3>
                                    <div className="space-y-2 pl-4">
                                        {eventTypes?.map((et) => (
                                            <FeedRow
                                                compact
                                                internal={et.isInternal}
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
