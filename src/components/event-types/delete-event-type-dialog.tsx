import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
    describeImpact,
    EventImpactItems,
    impactTotal,
} from "@/components/delete-impact";
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
import { eventTypesKeys, eventTypesQueries } from "@/lib/queries/event-types";
import { eventsKeys } from "@/lib/queries/events";
import { deleteEventType as deleteEventTypeFn } from "@/server/fns/event-types";

export type DeleteEventType = {
    id: string;
    slug: string;
    name: string;
};

type DeleteEventTypeDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventType: DeleteEventType | null;
};

/**
 * Threshold (single events + series + overridden occurrences) from which
 * the total has to be typed back as well; below it the slug is enough, and
 * with nothing affected nothing is typed.
 */
const COUNT_CONFIRM_THRESHOLD = 10;

/**
 * Deleting an event type deletes every event using it, so the confirmation
 * lists those events per space. How much has to be typed back scales with
 * the damage: nothing for an unused type, the slug once events are affected,
 * slug and total from COUNT_CONFIRM_THRESHOLD items on.
 */
export function DeleteEventTypeDialog({
    open,
    onOpenChange,
    eventType,
}: DeleteEventTypeDialogProps) {
    const queryClient = useQueryClient();
    const [slugInput, setSlugInput] = useState("");
    const [countInput, setCountInput] = useState("");

    const { data: impact } = useQuery({
        ...eventTypesQueries.deleteImpact(eventType?.id ?? ""),
        enabled: open && !!eventType,
    });
    const total = impact ? impactTotal(impact) : null;

    useEffect(() => {
        if (open) {
            setSlugInput("");
            setCountInput("");
        }
    }, [open]);

    const deleteEventType = useMutation({
        mutationFn: (input: Parameters<typeof deleteEventTypeFn>[0]["data"]) =>
            deleteEventTypeFn({ data: input }),
        onSuccess: (_result, input) => {
            queryClient.removeQueries({
                queryKey: eventTypesKeys.deleteImpact(input.id),
            });
            queryClient.invalidateQueries({ queryKey: eventTypesKeys.all });
            queryClient.invalidateQueries({ queryKey: eventsKeys.all });
            toast.success(`Event type "${eventType?.name}" deleted`);
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete event type");
        },
    });

    const needsSlug = total !== null && total > 0;
    const needsCount = total !== null && total >= COUNT_CONFIRM_THRESHOLD;
    const slugMatches =
        !needsSlug || (!!eventType && slugInput === eventType.slug);
    const countMatches = !needsCount || countInput.trim() === String(total);
    const canDelete =
        !!eventType &&
        total !== null &&
        slugMatches &&
        countMatches &&
        !deleteEventType.isPending;

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        Delete event type "{eventType?.name}"
                    </DialogTitle>
                    <DialogDescription>
                        This cannot be undone. Deleting the event type
                        permanently removes:
                    </DialogDescription>
                </DialogHeader>
                {eventType && (
                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (canDelete)
                                deleteEventType.mutate({ id: eventType.id });
                        }}
                    >
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                            <EventImpactItems
                                impact={impact}
                                loaded={!!impact}
                            />
                            {impact && impact.spaces.length > 0 && (
                                <li>
                                    Per space:
                                    <ul className="mt-1 list-[circle] space-y-0.5 pl-5">
                                        {impact.spaces.map((s) => (
                                            <li key={s.slug}>
                                                <strong>{s.name}</strong>:{" "}
                                                {describeImpact(s)}
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            )}
                            <li>
                                Feeds filtered by <code>{eventType.slug}</code>
                                {"; "}subscribed calendars will start failing
                            </li>
                            <li>
                                Permissions scoped to this event type stop
                                matching anything
                            </li>
                        </ul>

                        {needsSlug && (
                            <div className="space-y-2">
                                <Label htmlFor="delete-event-type-slug">
                                    Type the slug <code>{eventType.slug}</code>{" "}
                                    to confirm
                                </Label>
                                <Input
                                    autoComplete="off"
                                    id="delete-event-type-slug"
                                    onChange={(e) =>
                                        setSlugInput(e.target.value)
                                    }
                                    placeholder={eventType.slug}
                                    value={slugInput}
                                />
                            </div>
                        )}

                        {needsCount && (
                            <div className="space-y-2">
                                <Label htmlFor="delete-event-type-count">
                                    Type the total of single events, series and
                                    overridden occurrences that will be deleted
                                </Label>
                                <Input
                                    autoComplete="off"
                                    id="delete-event-type-count"
                                    inputMode="numeric"
                                    onChange={(e) =>
                                        setCountInput(e.target.value)
                                    }
                                    placeholder={String(total)}
                                    value={countInput}
                                />
                            </div>
                        )}

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
                                {deleteEventType.isPending
                                    ? "Deleting..."
                                    : "Delete event type permanently"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
