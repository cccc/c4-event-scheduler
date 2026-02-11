import { create } from "zustand";

import type { Occurrence } from "@/components/calendar/types";

type ActiveDialog = "create" | "details" | "edit" | null;

interface CalendarDialogStore {
	activeDialog: ActiveDialog;
	selectedDate: Date | null;
	occurrence: Occurrence | null;
	openCreate: (selectedDate?: Date | null) => void;
	openDetails: (occurrence: Occurrence) => void;
	openEdit: (occurrence?: Occurrence) => void;
	close: () => void;
}

export const useCalendarDialogStore = create<CalendarDialogStore>(
	(set, get) => ({
		activeDialog: null,
		selectedDate: null,
		occurrence: null,
		openCreate: (selectedDate = null) =>
			set({ activeDialog: "create", selectedDate, occurrence: null }),
		openDetails: (occurrence) =>
			set({ activeDialog: "details", occurrence, selectedDate: null }),
		openEdit: (occurrence?) => {
			const occ = occurrence ?? get().occurrence;
			if (occ) {
				set({ activeDialog: "edit", occurrence: occ, selectedDate: null });
			}
		},
		close: () =>
			set({ activeDialog: null, selectedDate: null, occurrence: null }),
	}),
);
