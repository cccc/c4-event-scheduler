import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { useState } from "react";

import { describeUsage } from "@/components/delete-impact";
import { CreateEventTypeDialog } from "@/components/event-types/create-event-type-dialog";
import {
    type DeleteEventType,
    DeleteEventTypeDialog,
} from "@/components/event-types/delete-event-type-dialog";
import { EditEventTypeDialog } from "@/components/event-types/edit-event-type-dialog";
import { SubscribeMenu } from "@/components/subscribe-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatEventLink } from "@/lib/event-link";
import { capabilitiesGrant } from "@/lib/permissions-core";
import { accountQueries } from "@/lib/queries/account";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { spacesQueries } from "@/lib/queries/spaces";
import { cn } from "@/lib/utils";

const UPCOMING_MONTHS = 6;

export const Route = createFileRoute("/_main/event-types")({
    // Prefetch so the page renders on the server; the components read the
    // same queries with useSuspenseQuery
    loader: async ({ context }) => {
        await Promise.all([
            context.queryClient.ensureQueryData(eventTypesQueries.list({})),
            context.queryClient.ensureQueryData(
                eventTypesQueries.upcoming({
                    months: UPCOMING_MONTHS,
                    perType: 2,
                }),
            ),
            context.queryClient.ensureQueryData(
                spacesQueries.list({ includePrivate: true }),
            ),
        ]);
    },
    component: EventTypesPage,
});

/** "Di., 16.09., 19:00" in the app timezone */
function formatUpcoming(date: Date, tz: string): string {
    return date.toLocaleString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
    });
}

/** 120 -> "2 h", 90 -> "1 h 30 min", 45 -> "45 min" */
function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function EventTypesPage() {
    const [open, setOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editingType, setEditingType] = useState<{
        id: string;
        slug: string;
        name: string;
        description: string | null;
        color: string | null;
        isInternal: boolean;
        defaultDurationMinutes: number | null;
        spaceId: string | null;
    } | null>(null);

    const [deleting, setDeleting] = useState<DeleteEventType | null>(null);
    const { session, appUrl, timezone: tz } = Route.useRouteContext();
    const isLoggedIn = !!session?.user;

    const { data: eventTypes } = useSuspenseQuery(eventTypesQueries.list({}));
    const { data: upcoming } = useSuspenseQuery(
        eventTypesQueries.upcoming({ months: UPCOMING_MONTHS, perType: 2 }),
    );
    const { data: spaces } = useSuspenseQuery(
        spacesQueries.list({ includePrivate: true }),
    );
    // Own capabilities decide which rows get management controls; the
    // server checks again on every mutation.
    const { data: account } = useQuery({
        ...accountQueries.info(),
        enabled: isLoggedIn,
    });
    // isLoggedIn guards against account data lingering from a previous session
    const canManage = (et: { slug: string; space: { slug: string } | null }) =>
        isLoggedIn &&
        !!account &&
        capabilitiesGrant(account, {
            eventTypeSlug: et.slug,
            spaceSlug: et.space?.slug,
        });
    // Global types need admin or a global permission, space-specific ones a
    // permission for that space; anyone with any permission may get to create
    const canCreate =
        isLoggedIn &&
        !!account &&
        (account.isAdmin || account.permissions.length > 0);

    return (
        <>
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="mb-2 font-bold text-3xl">Event Types</h1>
                    <p className="text-muted-foreground">
                        Event types are templates for categorizing events (e.g.,
                        "Meetup", "Workshop", "Conference").
                    </p>
                </div>

                {canCreate && (
                    <>
                        <Button onClick={() => setOpen(true)}>
                            Create Event Type
                        </Button>
                        <CreateEventTypeDialog
                            onOpenChange={setOpen}
                            open={open}
                            spaces={spaces}
                        />
                    </>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {eventTypes.map((et) => {
                    // Space-specific types have one feed; global ones get
                    // the cross-space feed
                    const feedUrl = et.space
                        ? `${appUrl}/api/cal/${et.space.slug}/${et.slug}.ics`
                        : `${appUrl}/api/cal/all/${et.slug}.ics`;
                    // A public type in a public space hides nothing; a
                    // global public type still gains private-space events
                    // with a token; internal or private = token only
                    const feedAccess =
                        et.isInternal || (et.space && !et.space.isPublic)
                            ? "internal"
                            : et.space
                              ? "public"
                              : "mixed";
                    const next = upcoming[et.id] ?? [];
                    return (
                        <Card key={et.id}>
                            <CardHeader>
                                <CardTitle className="flex flex-wrap items-center gap-2">
                                    {et.color && (
                                        <span
                                            className="h-3 w-3 shrink-0 rounded-full"
                                            style={{
                                                backgroundColor: et.color,
                                            }}
                                        />
                                    )}
                                    {et.name}
                                    {et.spaceId ? (
                                        <span className="rounded bg-muted px-1.5 py-0.5 font-normal text-muted-foreground text-xs">
                                            {et.space?.name ?? "Space"}
                                        </span>
                                    ) : (
                                        <span className="rounded bg-primary px-1.5 py-0.5 font-normal text-primary-foreground text-xs">
                                            Global
                                        </span>
                                    )}
                                    {et.isInternal && (
                                        <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-normal text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                            Internal
                                        </span>
                                    )}
                                </CardTitle>
                                {et.description && (
                                    <CardDescription>
                                        {et.description}
                                    </CardDescription>
                                )}
                                {canManage(et) && (
                                    <CardAction>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    aria-label={`Actions for ${et.name}`}
                                                    size="icon"
                                                    variant="ghost"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        setEditingType({
                                                            id: et.id,
                                                            slug: et.slug,
                                                            name: et.name,
                                                            description:
                                                                et.description,
                                                            color: et.color,
                                                            isInternal:
                                                                et.isInternal,
                                                            defaultDurationMinutes:
                                                                et.defaultDurationMinutes,
                                                            spaceId: et.spaceId,
                                                        });
                                                        setEditOpen(true);
                                                    }}
                                                >
                                                    Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() =>
                                                        setDeleting({
                                                            id: et.id,
                                                            slug: et.slug,
                                                            name: et.name,
                                                        })
                                                    }
                                                    variant="destructive"
                                                >
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </CardAction>
                                )}
                            </CardHeader>
                            {/* flex-1 pins the footer to the card bottom so the grid row lines up */}
                            <CardContent className="flex-1 space-y-3">
                                <div>
                                    <div className="mb-1 font-medium text-sm">
                                        Upcoming
                                    </div>
                                    {next.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">
                                            No events in the next{" "}
                                            {UPCOMING_MONTHS} months.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-sm">
                                            {next.map((occ) => (
                                                <li
                                                    className="flex flex-wrap items-baseline gap-x-2"
                                                    key={occ.id}
                                                >
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {formatUpcoming(
                                                            occ.dtstart,
                                                            tz,
                                                        )}
                                                    </span>
                                                    <Link
                                                        className={cn(
                                                            "font-medium hover:underline",
                                                            occ.status ===
                                                                "cancelled" &&
                                                                "line-through opacity-60",
                                                        )}
                                                        params={{
                                                            slug: occ.spaceSlug,
                                                        }}
                                                        search={{
                                                            event: formatEventLink(
                                                                occ.eventId,
                                                                occ.occurrenceDate,
                                                            ),
                                                        }}
                                                        to="/spaces/$slug"
                                                    >
                                                        {occ.summary}
                                                    </Link>
                                                    <span className="text-muted-foreground">
                                                        in {occ.spaceName}
                                                    </span>
                                                    {occ.status ===
                                                        "cancelled" && (
                                                        <Badge variant="outline">
                                                            Cancelled
                                                        </Badge>
                                                    )}
                                                    {occ.status ===
                                                        "tentative" && (
                                                        <Badge variant="outline">
                                                            Tentative
                                                        </Badge>
                                                    )}
                                                    {occ.isDraft && (
                                                        <Badge variant="outline">
                                                            Draft
                                                        </Badge>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    /{et.slug}
                                    {et.defaultDurationMinutes && (
                                        <>
                                            {" · "}usually{" "}
                                            {formatDuration(
                                                et.defaultDurationMinutes,
                                            )}
                                        </>
                                    )}
                                    {et.usage && (
                                        <>
                                            {" · "}
                                            {describeUsage(et.usage) ?? (
                                                <em>no events</em>
                                            )}
                                        </>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="gap-2">
                                <SubscribeMenu
                                    access={feedAccess}
                                    url={feedUrl}
                                />
                                {et.space && (
                                    <Button asChild size="sm" variant="ghost">
                                        <Link
                                            params={{ slug: et.space.slug }}
                                            to="/spaces/$slug"
                                        >
                                            Open calendar
                                        </Link>
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    );
                })}

                {eventTypes.length === 0 && (
                    <p className="text-muted-foreground">
                        No event types yet.{" "}
                        {canCreate && "Create one to get started."}
                    </p>
                )}
            </div>

            <DeleteEventTypeDialog
                eventType={deleting}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                open={deleting !== null}
            />
            <EditEventTypeDialog
                eventType={editingType}
                onOpenChange={(open) => {
                    setEditOpen(open);
                    if (!open) setEditingType(null);
                }}
                open={editOpen}
                spaces={spaces}
            />
        </>
    );
}
