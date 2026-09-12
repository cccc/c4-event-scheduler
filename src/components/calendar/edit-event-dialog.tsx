import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit Event</DialogTitle>
                    {occurrence.isRecurring && (
                        <DialogDescription>
                            Occurrence on {occurrence.occurrenceDate}
                        </DialogDescription>
                    )}
                </DialogHeader>

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
