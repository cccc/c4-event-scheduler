"use client";

import {
	CalendarDays,
	Clock,
	ExternalLink,
	FileText,
	MapPin,
	Tag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";

import type { OccurrenceStatus } from "./types";

type EventDetailsDialogProps = {
	canEdit: boolean;
};

function formatDate(date: Date): string {
	return date.toLocaleDateString("de-DE", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString("de-DE", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getStatusBadge(status: OccurrenceStatus) {
	switch (status) {
		case "confirmed":
			return <Badge variant="default">Confirmed</Badge>;
		case "tentative":
			return <Badge variant="secondary">Tentative</Badge>;
		case "pending":
			return <Badge variant="outline">Draft</Badge>;
		case "cancelled":
			return <Badge variant="destructive">Cancelled</Badge>;
		case "gone":
			return <Badge variant="destructive">Deleted</Badge>;
		default:
			return null;
	}
}

export function EventDetailsDialog({ canEdit }: EventDetailsDialogProps) {
	const store = useCalendarDialogStore();

	const isOpen = store.activeDialog === "details";
	const occurrence = store.occurrence;

	if (!occurrence) return null;

	const displayLocation = occurrence.location ?? occurrence.space.name;
	const showSpaceSeparately =
		occurrence.location && occurrence.location !== occurrence.space.name;

	return (
		<Dialog onOpenChange={() => store.close()} open={isOpen}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<DialogTitle className="text-xl">{occurrence.title}</DialogTitle>
							<div className="flex items-center gap-2">
								{occurrence.eventType && (
									<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
										{occurrence.eventType.color && (
											<span
												className="h-2.5 w-2.5 rounded-full"
												style={{ backgroundColor: occurrence.eventType.color }}
											/>
										)}
										<span>{occurrence.eventType.name}</span>
									</div>
								)}
								{getStatusBadge(occurrence.status)}
								{occurrence.isInternal && (
									<Badge variant="outline">Internal</Badge>
								)}
							</div>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-4">
					{/* Date & Time */}
					<div className="flex items-start gap-3">
						<CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div>
							<div className="font-medium">{formatDate(occurrence.start)}</div>
							<div className="flex items-center gap-1 text-muted-foreground text-sm">
								<Clock className="h-3.5 w-3.5" />
								<span>
									{formatTime(occurrence.start)}
									{occurrence.end && ` – ${formatTime(occurrence.end)}`}
								</span>
							</div>
							{occurrence.isRecurring && (
								<div className="mt-1 text-muted-foreground text-sm">
									Part of a recurring series
								</div>
							)}
						</div>
					</div>

					{/* Description */}
					{occurrence.description && (
						<div className="flex items-start gap-3">
							<FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
							<div className="whitespace-pre-wrap text-sm">
								{occurrence.description}
							</div>
						</div>
					)}

					{/* URL */}
					{occurrence.url && (
						<div className="flex items-start gap-3">
							<ExternalLink className="mt-0.5 h-5 w-5 text-muted-foreground" />
							<a
								className="text-primary text-sm hover:underline"
								href={occurrence.url}
								rel="noopener noreferrer"
								target="_blank"
							>
								{occurrence.url}
							</a>
						</div>
					)}

					{/* Location */}
					<div className="flex items-start gap-3">
						<MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div className="text-sm">{displayLocation}</div>
					</div>

					{/* Space (shown separately if location differs) */}
					{showSpaceSeparately && (
						<div className="flex items-start gap-3">
							<Tag className="mt-0.5 h-5 w-5 text-muted-foreground" />
							<div className="text-sm">{occurrence.space.name}</div>
						</div>
					)}

					{/* Notes (only shown if there are override notes) */}
					{occurrence.notes && (
						<div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
							<div className="font-medium text-amber-800 text-sm dark:text-amber-200">
								Note
							</div>
							<div className="mt-1 text-amber-700 text-sm dark:text-amber-300">
								{occurrence.notes}
							</div>
						</div>
					)}
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-2 border-t pt-4">
					<Button onClick={() => store.close()} variant="outline">
						Close
					</Button>
					{canEdit && <Button onClick={() => store.openEdit()}>Edit</Button>}
				</div>
			</DialogContent>
		</Dialog>
	);
}
