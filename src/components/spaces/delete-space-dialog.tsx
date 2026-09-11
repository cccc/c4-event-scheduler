import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eventTypesKeys } from "@/lib/queries/event-types";
import { eventsKeys } from "@/lib/queries/events";
import { spacesKeys, spacesQueries } from "@/lib/queries/spaces";
import { deleteSpace as deleteSpaceFn } from "@/server/fns/spaces";

export type DeleteSpace = {
    id: string;
    slug: string;
    name: string;
};

type DeleteSpaceDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    space: DeleteSpace | null;
};

/**
 * Deleting a space takes every event in it along, so the confirmation asks
 * the user to type back both the slug and the number of events that will be
 * lost; the numbers come from the server, not from the list.
 */
export function DeleteSpaceDialog({
    open,
    onOpenChange,
    space,
}: DeleteSpaceDialogProps) {
    const queryClient = useQueryClient();
    const [slugInput, setSlugInput] = useState("");
    const [countInput, setCountInput] = useState("");

    const { data: impact } = useQuery({
        ...spacesQueries.deleteImpact(space?.id ?? ""),
        enabled: open && !!space,
    });

    // Start from empty fields every time the dialog opens
    useEffect(() => {
        if (open) {
            setSlugInput("");
            setCountInput("");
        }
    }, [open]);

    const deleteSpace = useMutation({
        mutationFn: (input: Parameters<typeof deleteSpaceFn>[0]["data"]) =>
            deleteSpaceFn({ data: input }),
        onSuccess: (_result, input) => {
            // The impact query for a deleted space would only 404 on refetch
            queryClient.removeQueries({
                queryKey: spacesKeys.deleteImpact(input.id),
            });
            queryClient.invalidateQueries({ queryKey: spacesKeys.all });
            queryClient.invalidateQueries({ queryKey: eventsKeys.all });
            queryClient.invalidateQueries({ queryKey: eventTypesKeys.all });
            toast.success(`Space "${space?.name}" deleted`);
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete space");
        },
    });

    const slugMatches = !!space && slugInput === space.slug;
    const countMatches =
        !!impact && countInput.trim() === String(impact.events);
    const canDelete =
        slugMatches && countMatches && !deleteSpace.isPending && !!space;

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete space "{space?.name}"</DialogTitle>
                    <DialogDescription>
                        This cannot be undone. Deleting the space permanently
                        removes:
                    </DialogDescription>
                </DialogHeader>
                {space && (
                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (canDelete) deleteSpace.mutate({ id: space.id });
                        }}
                    >
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                            <li>
                                <strong>
                                    {impact ? impact.events : "…"}{" "}
                                    {impact?.events === 1 ? "event" : "events"}
                                </strong>{" "}
                                (each series counts once), including all their
                                occurrences and overrides
                            </li>
                            <li>
                                <strong>
                                    {impact ? impact.eventTypes : "…"}{" "}
                                    {impact?.eventTypes === 1
                                        ? "event type"
                                        : "event types"}
                                </strong>{" "}
                                that exist only in this space
                            </li>
                            <li>
                                The feeds <code>/api/cal/{space.slug}.ics</code>{" "}
                                and every filtered variant of them; subscribed
                                calendars will start failing
                            </li>
                            <li>
                                Permissions scoped to this space stop matching
                                anything
                            </li>
                        </ul>

                        <div className="space-y-2">
                            <Label htmlFor="delete-space-slug">
                                Type the space slug <code>{space.slug}</code> to
                                confirm
                            </Label>
                            <Input
                                autoComplete="off"
                                id="delete-space-slug"
                                onChange={(e) => setSlugInput(e.target.value)}
                                placeholder={space.slug}
                                value={slugInput}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="delete-space-count">
                                Type the number of events that will be deleted
                            </Label>
                            <Input
                                autoComplete="off"
                                id="delete-space-count"
                                inputMode="numeric"
                                onChange={(e) => setCountInput(e.target.value)}
                                placeholder={impact ? "0" : "loading…"}
                                value={countInput}
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                onClick={() => onOpenChange(false)}
                                type="button"
                                variant="outline"
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={!canDelete}
                                type="submit"
                                variant="destructive"
                            >
                                {deleteSpace.isPending
                                    ? "Deleting..."
                                    : "Delete space permanently"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
