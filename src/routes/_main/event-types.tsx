import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { CreateEventTypeDialog } from "@/components/event-types/create-event-type-dialog";
import {
    type DeleteEventType,
    DeleteEventTypeDialog,
} from "@/components/event-types/delete-event-type-dialog";
import { EditEventTypeDialog } from "@/components/event-types/edit-event-type-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capabilitiesGrant } from "@/lib/permissions-core";
import { accountQueries } from "@/lib/queries/account";
import { eventTypesQueries } from "@/lib/queries/event-types";
import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/event-types")({
    component: EventTypesPage,
});

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
    const { session } = Route.useRouteContext();
    const isLoggedIn = !!session?.user;

    const { data: eventTypes, isLoading } = useQuery(
        eventTypesQueries.list({}),
    );
    const { data: spaces } = useQuery(
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
                            spaces={spaces ?? []}
                        />
                    </>
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
                                        <span className="font-medium">
                                            {et.name}
                                        </span>
                                        {et.spaceId ? (
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                                                {et.space?.name ?? "Space"}
                                            </span>
                                        ) : (
                                            <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs">
                                                Global
                                            </span>
                                        )}
                                        {et.isInternal && (
                                            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                                Internal
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
                            {canManage(et) && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            aria-label={`Actions for ${et.name}`}
                                            size="icon"
                                            variant="ghost"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setEditingType({
                                                    id: et.id,
                                                    slug: et.slug,
                                                    name: et.name,
                                                    description: et.description,
                                                    color: et.color,
                                                    isInternal: et.isInternal,
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
                            )}
                        </div>
                    ))}

                    {eventTypes?.length === 0 && (
                        <p className="text-muted-foreground">
                            No event types yet.{" "}
                            {canCreate && "Create one to get started."}
                        </p>
                    )}
                </div>
            )}

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
            />
        </>
    );
}
