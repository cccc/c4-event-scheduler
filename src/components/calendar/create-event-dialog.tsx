"use client";

import { useState } from "react";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";

import { CreateSeriesForm } from "./create-series-form";
import { CreateSingleEventForm } from "./create-single-event-form";
import type { EventType, Space } from "./types";

type CreateEventDialogProps = {
	space: Space;
	eventTypes: EventType[];
};

export function CreateEventDialog({
	space,
	eventTypes,
}: CreateEventDialogProps) {
	const [createTab, setCreateTab] = useState<"single" | "series">("single");
	const store = useCalendarDialogStore();

	const isOpen = store.activeDialog === "create";
	const selectedDate = store.selectedDate;

	const handleClose = () => {
		store.close();
		setCreateTab("single");
	};

	return (
		<Dialog onOpenChange={handleClose} open={isOpen}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Create Event</DialogTitle>
				</DialogHeader>

				<Tabs
					onValueChange={(v) => setCreateTab(v as "single" | "series")}
					value={createTab}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="single">Single Event</TabsTrigger>
						<TabsTrigger value="series">Series</TabsTrigger>
					</TabsList>
				</Tabs>

				{createTab === "single" ? (
					<CreateSingleEventForm
						eventTypes={eventTypes}
						onClose={handleClose}
						selectedDate={selectedDate}
						space={space}
					/>
				) : (
					<CreateSeriesForm
						eventTypes={eventTypes}
						onClose={handleClose}
						selectedDate={selectedDate}
						space={space}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
