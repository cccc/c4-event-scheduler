"use client";

import {
	CalendarDays,
	Clock,
	ExternalLink,
	FileText,
	Info,
	MapPin,
	Repeat,
	Tag,
	User,
} from "lucide-react";
import { useState } from "react";
import { RRule } from "rrule";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { env } from "@/env";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";
import { api } from "@/trpc/react";

import type { EventStatus } from "./types";

const tz = env.NEXT_PUBLIC_APP_TIMEZONE;

type EventDetailsDialogProps = {
	canEdit: boolean;
};

function formatDate(date: Date): string {
	return date.toLocaleDateString("de-DE", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: tz,
	});
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString("de-DE", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: tz,
	});
}

function formatDateTime(date: Date): string {
	return date.toLocaleString("de-DE", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: tz,
	});
}

function formatExdate(dateStr: string): string {
	// dateStr is YYYY-MM-DD — a date-only value, display as UTC to match the stored date
	const [year, month, day] = dateStr.split("-").map(Number);
	if (!year || !month || !day) return dateStr;
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.toLocaleDateString("de-DE", {
		weekday: "short",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

function describeOverride(override: {
	occurrenceDate: string;
	status: string | null;
	summary: string | null;
	description: string | null;
	url: string | null;
	location: string | null;
	dtstart: Date | null;
	dtend: Date | null;
	notes: string | null;
}): string {
	const changes: string[] = [];
	if (override.status) changes.push(`status: ${override.status}`);
	if (override.summary) changes.push("title changed");
	if (override.dtstart) changes.push(`time: ${formatTime(override.dtstart)}`);
	if (override.location) changes.push("location changed");
	if (override.notes) changes.push(`note: ${override.notes}`);
	if (override.description) changes.push("description changed");
	if (override.url) changes.push("URL changed");
	return changes.length > 0 ? changes.join(", ") : "modified";
}

function getStatusBadge(status: EventStatus, isDraft: boolean) {
	const badges = [];
	if (isDraft) {
		badges.push(
			<Badge key="draft" variant="outline">
				Draft
			</Badge>,
		);
	}
	switch (status) {
		case "confirmed":
			badges.push(
				<Badge key="status" variant="default">
					Confirmed
				</Badge>,
			);
			break;
		case "tentative":
			badges.push(
				<Badge key="status" variant="secondary">
					Tentative
				</Badge>,
			);
			break;
		case "cancelled":
			badges.push(
				<Badge key="status" variant="destructive">
					Cancelled
				</Badge>,
			);
			break;
	}
	return badges;
}

function OccurrenceContent({ canEdit }: { canEdit: boolean }) {
	const store = useCalendarDialogStore();
	const occurrence = store.occurrence;

	// Fetch full event data for single events to show creator info
	const { data: eventData } = api.events.getById.useQuery(
		{ id: occurrence?.eventId ?? "" },
		{ enabled: !!occurrence && !occurrence.isRecurring },
	);

	if (!occurrence) return null;

	const displayLocation = occurrence.location ?? occurrence.space.name;
	const showSpaceSeparately =
		occurrence.location && occurrence.location !== occurrence.space.name;

	return (
		<>
			<div className="space-y-4">
				{/* Date & Time */}
				<div className="flex items-start gap-3">
					<CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
					<div>
						<div className="font-medium">{formatDate(occurrence.dtstart)}</div>
						<div className="flex items-center gap-1 text-muted-foreground text-sm">
							<Clock className="h-3.5 w-3.5" />
							<span>
								{formatTime(occurrence.dtstart)}
								{occurrence.dtend && ` – ${formatTime(occurrence.dtend)}`}
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

				{/* Created/Updated by (single events only — recurring shows this in Series Info tab) */}
				{!occurrence.isRecurring &&
					(() => {
						const createdByLabel =
							eventData?.createdBy?.name ??
							(eventData?.createdByApiKey
								? `API: ${eventData.createdByApiKey.name}`
								: null);
						const updatedByLabel =
							eventData?.updatedBy?.name ??
							(eventData?.updatedByApiKey
								? `API: ${eventData.updatedByApiKey.name}`
								: null);
						return (
							<>
								{createdByLabel && eventData && (
									<div className="flex items-start gap-3">
										<User className="mt-0.5 h-5 w-5 text-muted-foreground" />
										<div className="text-sm">
											Created by {createdByLabel}
											<span className="text-muted-foreground">
												{" · "}
												{formatDateTime(eventData.createdAt)}
											</span>
										</div>
									</div>
								)}
								{updatedByLabel && eventData && (
									<div className="flex items-start gap-3">
										<User className="mt-0.5 h-5 w-5 text-muted-foreground" />
										<div className="text-sm">
											Last edited by {updatedByLabel}
											<span className="text-muted-foreground">
												{" · "}
												{formatDateTime(eventData.updatedAt)}
											</span>
										</div>
									</div>
								)}
							</>
						);
					})()}
			</div>

			{/* Actions */}
			<div className="flex justify-end gap-2 border-t pt-4">
				<Button onClick={() => store.close()} variant="outline">
					Close
				</Button>
				{canEdit && <Button onClick={() => store.openEdit()}>Edit</Button>}
			</div>
		</>
	);
}

function SeriesInfoContent({ eventId }: { eventId: string }) {
	const { data: seriesEvent, isLoading } = api.events.getById.useQuery({
		id: eventId,
	});

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-6 w-3/4" />
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-4 w-2/3" />
				<Skeleton className="h-4 w-1/2" />
			</div>
		);
	}

	if (!seriesEvent) {
		return (
			<div className="text-muted-foreground text-sm">Series not found.</div>
		);
	}

	// Parse RRULE for human-readable description
	let rruleDescription: string | null = null;
	if (seriesEvent.rrule) {
		try {
			const baseRule = RRule.fromString(seriesEvent.rrule);
			const rule = new RRule({
				...baseRule.origOptions,
				dtstart: seriesEvent.dtstart,
			});
			rruleDescription = rule.toText();
		} catch {
			rruleDescription = seriesEvent.rrule;
		}
	}

	// Parse exdates
	const exdates = seriesEvent.exdates
		? seriesEvent.exdates
				.split(",")
				.map((d) => d.trim())
				.filter(Boolean)
		: [];

	// Overrides
	const overrides = seriesEvent.overrides ?? [];

	return (
		<div className="space-y-4">
			{/* Series summary + badges */}
			<div>
				<div className="font-medium text-lg">{seriesEvent.summary}</div>
				<div className="mt-1 flex items-center gap-2">
					{getStatusBadge(seriesEvent.status, seriesEvent.isDraft)}
				</div>
			</div>

			{/* Recurrence pattern */}
			{rruleDescription && (
				<div className="flex items-start gap-3">
					<Repeat className="mt-0.5 h-5 w-5 text-muted-foreground" />
					<div>
						<div className="text-sm capitalize">{rruleDescription}</div>
						{seriesEvent.frequencyLabel && (
							<div className="text-muted-foreground text-xs">
								{seriesEvent.frequencyLabel}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Date range */}
			<div className="flex items-start gap-3">
				<CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
				<div className="text-sm">
					<span>Starts {formatDate(seriesEvent.dtstart)}</span>
					{seriesEvent.recurrenceEndDate && (
						<>
							<br />
							<span>Ends {formatDate(seriesEvent.recurrenceEndDate)}</span>
						</>
					)}
					{!seriesEvent.recurrenceEndDate && (
						<>
							<br />
							<span className="text-muted-foreground">No end date</span>
						</>
					)}
				</div>
			</div>

			{/* Excluded dates */}
			{exdates.length > 0 && (
				<div className="flex items-start gap-3">
					<Info className="mt-0.5 h-5 w-5 text-muted-foreground" />
					<div>
						<div className="mb-1 font-medium text-sm">
							Excluded dates ({exdates.length})
						</div>
						<ul className="space-y-0.5 text-muted-foreground text-sm">
							{exdates.map((d) => (
								<li key={d}>{formatExdate(d)}</li>
							))}
						</ul>
					</div>
				</div>
			)}

			{/* Overridden occurrences */}
			{overrides.length > 0 && (
				<div className="flex items-start gap-3">
					<FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
					<div>
						<div className="mb-1 font-medium text-sm">
							Overridden occurrences ({overrides.length})
						</div>
						<ul className="space-y-1 text-sm">
							{overrides.map((o) => (
								<li className="text-muted-foreground" key={o.id}>
									<span className="font-medium text-foreground">
										{formatExdate(o.occurrenceDate)}
									</span>
									{" — "}
									{describeOverride(o)}
								</li>
							))}
						</ul>
					</div>
				</div>
			)}

			{/* Created by */}
			{(() => {
				const label =
					seriesEvent.createdBy?.name ??
					(seriesEvent.createdByApiKey
						? `API: ${seriesEvent.createdByApiKey.name}`
						: null);
				return label ? (
					<div className="flex items-start gap-3">
						<User className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div className="text-sm">
							Created by {label}
							<span className="text-muted-foreground">
								{" · "}
								{formatDateTime(seriesEvent.createdAt)}
							</span>
						</div>
					</div>
				) : null;
			})()}

			{/* Last edited by */}
			{(() => {
				const label =
					seriesEvent.updatedBy?.name ??
					(seriesEvent.updatedByApiKey
						? `API: ${seriesEvent.updatedByApiKey.name}`
						: null);
				return label ? (
					<div className="flex items-start gap-3">
						<User className="mt-0.5 h-5 w-5 text-muted-foreground" />
						<div className="text-sm">
							Last edited by {label}
							<span className="text-muted-foreground">
								{" · "}
								{formatDateTime(seriesEvent.updatedAt)}
							</span>
						</div>
					</div>
				) : null;
			})()}
		</div>
	);
}

export function EventDetailsDialog({ canEdit }: EventDetailsDialogProps) {
	const store = useCalendarDialogStore();
	const [activeTab, setActiveTab] = useState("occurrence");

	const isOpen = store.activeDialog === "details";
	const occurrence = store.occurrence;

	if (!occurrence) return null;

	// Single events: flat view (no tabs)
	if (!occurrence.isRecurring) {
		return (
			<Dialog onOpenChange={() => store.close()} open={isOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<DialogTitle className="text-xl">
									{occurrence.summary}
								</DialogTitle>
								<div className="flex items-center gap-2">
									{occurrence.eventType && (
										<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
											{occurrence.eventType.color && (
												<span
													className="h-2.5 w-2.5 rounded-full"
													style={{
														backgroundColor: occurrence.eventType.color,
													}}
												/>
											)}
											<span>{occurrence.eventType.name}</span>
										</div>
									)}
									{getStatusBadge(occurrence.status, occurrence.isDraft)}
									{occurrence.isInternal && (
										<Badge variant="outline">Internal</Badge>
									)}
								</div>
							</div>
						</div>
					</DialogHeader>
					<OccurrenceContent canEdit={canEdit} />
				</DialogContent>
			</Dialog>
		);
	}

	// Recurring events: tabbed view
	return (
		<Dialog
			onOpenChange={() => {
				store.close();
				setActiveTab("occurrence");
			}}
			open={isOpen}
		>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<DialogTitle className="text-xl">
								{occurrence.summary}
							</DialogTitle>
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
								{getStatusBadge(occurrence.status, occurrence.isDraft)}
								{occurrence.isInternal && (
									<Badge variant="outline">Internal</Badge>
								)}
							</div>
						</div>
					</div>
				</DialogHeader>

				<Tabs onValueChange={setActiveTab} value={activeTab}>
					<TabsList className="w-full">
						<TabsTrigger className="flex-1" value="occurrence">
							This Occurrence
						</TabsTrigger>
						<TabsTrigger className="flex-1" value="series">
							Series Info
						</TabsTrigger>
					</TabsList>

					<TabsContent value="occurrence">
						<OccurrenceContent canEdit={canEdit} />
					</TabsContent>

					<TabsContent value="series">
						<SeriesInfoContent eventId={occurrence.eventId} />
						<div className="flex justify-end gap-2 border-t pt-4">
							<Button onClick={() => store.close()} variant="outline">
								Close
							</Button>
							{canEdit && (
								<Button onClick={() => store.openEdit(undefined, "series")}>
									Edit Series
								</Button>
							)}
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
