import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CreateEventTypeDialog } from "@/components/event-types/create-event-type-dialog";
import { EditEventTypeDialog } from "@/components/event-types/edit-event-type-dialog";
import { Button } from "@/components/ui/button";
import { eventTypesKeys, eventTypesQueries } from "@/lib/queries/event-types";
import { spacesQueries } from "@/lib/queries/spaces";
import { deleteEventType as deleteEventTypeFn } from "@/server/fns/event-types";

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

    const queryClient = useQueryClient();
    const { session } = Route.useRouteContext();

    const { data: eventTypes, isLoading } = useQuery(
        eventTypesQueries.list({}),
    );
    const { data: spaces } = useQuery(
        spacesQueries.list({ includePrivate: true }),
    );

    const deleteEventType = useMutation({
        mutationFn: (input: Parameters<typeof deleteEventTypeFn>[0]["data"]) =>
            deleteEventTypeFn({ data: input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: eventTypesKeys.all });
        },
    });

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
                        Event types are templates for categorizing events (e.g.,
                        "Meetup", "Workshop", "Conference").
                    </p>
                </div>

                {isLoggedIn && (
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
                                                isInternal: et.isInternal,
                                                defaultDurationMinutes:
                                                    et.defaultDurationMinutes,
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
                            No event types yet.{" "}
                            {isLoggedIn && "Create one to get started."}
                        </p>
                    )}
                </div>
            )}

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
