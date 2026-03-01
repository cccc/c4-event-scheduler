"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";

import { EditSeriesForm } from "./edit-series-form";
import { EditSingleEventForm } from "./edit-single-event-form";

export function EditEventDialog() {
    const store = useCalendarDialogStore();

    const isOpen = store.activeDialog === "edit";
    const occurrence = store.occurrence;

    const handleClose = () => {
        store.close();
    };

    if (!occurrence) return null;

    return (
        <Dialog onOpenChange={handleClose} open={isOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Edit Event</DialogTitle>
                    {occurrence.isRecurring && (
                        <DialogDescription>
                            Occurrence on {occurrence.occurrenceDate}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {/* Event Type (read-only) */}
                <div>
                    <Label>Event Type</Label>
                    <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
                        {occurrence.eventType?.color && (
                            <span
                                className="h-3 w-3 rounded-full"
                                style={{
                                    backgroundColor: occurrence.eventType.color,
                                }}
                            />
                        )}
                        {occurrence.eventType?.name ?? "Unknown"}
                    </div>
                </div>

                {occurrence.isRecurring ? (
                    <EditSeriesForm
                        initialTab={store.editTab ?? undefined}
                        occurrence={occurrence}
                        onClose={handleClose}
                    />
                ) : (
                    <EditSingleEventForm
                        occurrence={occurrence}
                        onClose={handleClose}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
