import { create } from "zustand";

import type { Occurrence } from "@/components/calendar/types";

// The create and edit dialogs. The details dialog is not in here: it
// follows the space route's ?event= (useCalendarDeepLink)
type ActiveDialog = "create" | "edit" | null;
export type EditTab = "occurrence" | "fromHere" | "whole";

interface CalendarDialogStore {
    activeDialog: ActiveDialog;
    selectedDate: Date | null;
    occurrence: Occurrence | null;
    editTab: EditTab | null;
    openCreate: (selectedDate?: Date | null) => void;
    openEdit: (occurrence: Occurrence, editTab?: EditTab) => void;
    close: () => void;
}

export const useCalendarDialogStore = create<CalendarDialogStore>((set) => ({
    activeDialog: null,
    selectedDate: null,
    occurrence: null,
    editTab: null,
    openCreate: (selectedDate = null) =>
        set({
            activeDialog: "create",
            selectedDate,
            occurrence: null,
            editTab: null,
        }),
    openEdit: (occurrence, editTab) =>
        set({
            activeDialog: "edit",
            occurrence,
            selectedDate: null,
            editTab: editTab ?? null,
        }),
    close: () =>
        set({
            activeDialog: null,
            selectedDate: null,
            occurrence: null,
            editTab: null,
        }),
}));
