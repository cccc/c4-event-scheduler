import { create } from "zustand";

import type { Occurrence } from "@/components/calendar/types";

type ActiveDialog = "create" | "details" | "edit" | null;
export type EditTab = "occurrence" | "series";

interface CalendarDialogStore {
	activeDialog: ActiveDialog;
	selectedDate: Date | null;
	occurrence: Occurrence | null;
	editTab: EditTab | null;
	openCreate: (selectedDate?: Date | null) => void;
	openDetails: (occurrence: Occurrence) => void;
	openEdit: (occurrence?: Occurrence, editTab?: EditTab) => void;
	close: () => void;
}

export const useCalendarDialogStore = create<CalendarDialogStore>(
	(set, get) => ({
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
		openDetails: (occurrence) =>
			set({
				activeDialog: "details",
				occurrence,
				selectedDate: null,
				editTab: null,
			}),
		openEdit: (occurrence?, editTab?) => {
			const occ = occurrence ?? get().occurrence;
			if (occ) {
				set({
					activeDialog: "edit",
					occurrence: occ,
					selectedDate: null,
					editTab: editTab ?? null,
				});
			}
		},
		close: () =>
			set({
				activeDialog: null,
				selectedDate: null,
				occurrence: null,
				editTab: null,
			}),
	}),
);
