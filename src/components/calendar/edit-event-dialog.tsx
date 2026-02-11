"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import {
	buildRRuleFromConfig,
	parseRRuleToConfig,
	type RecurrenceConfig,
} from "@/components/recurrence-picker";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm, withForm } from "@/hooks/form";
import { useCalendarDialogStore } from "@/lib/stores/calendar-dialog-store";
import { api } from "@/trpc/react";

import {
	combineDateAndTime,
	parseLocalDateTime,
	toLocalDateTimeString,
	toLocalTimeString,
} from "./date-utils";
import type { Occurrence } from "./types";

const occurrenceFormSchema = z.object({
	title: z.string(),
	description: z.string(),
	url: z.string().url("Must be a valid URL").or(z.literal("")),
	notes: z.string(),
	status: z.enum(["confirmed", "tentative", "pending", "cancelled"]),
	startTime: z.string(),
	endTime: z.string(),
	hasEndTime: z.boolean(),
});

const seriesFormSchema = z.object({
	title: z.string().min(1, "Title is required"),
	description: z.string(),
	url: z.string().url("Must be a valid URL").or(z.literal("")),
	status: z.enum(["confirmed", "tentative", "pending", "cancelled"]),
	seriesFirstDate: z.string().min(1, "First date is required"),
	occurrenceStartTime: z.string().min(1, "Start time is required"),
	occurrenceEndTime: z.string(),
	hasEndTime: z.boolean(),
	seriesLastDate: z.string(),
	seriesHasEndDate: z.boolean(),
	recurrenceConfig: z.custom<RecurrenceConfig>().nullable(),
});

const singleEventFormSchema = z.object({
	title: z.string().min(1, "Title is required"),
	description: z.string(),
	url: z.string().url("Must be a valid URL").or(z.literal("")),
	status: z.enum(["confirmed", "tentative", "pending", "cancelled"]),
	startTime: z.string().min(1, "Start time is required"),
	endTime: z.string(),
	hasEndTime: z.boolean(),
});

export function EditEventDialog() {
	const store = useCalendarDialogStore();

	const isOpen = store.activeDialog === "edit";
	const occurrence = store.occurrence;
	const [editTab, setEditTab] = useState<"occurrence" | "series">("occurrence");
	const [seriesEditScope, setSeriesEditScope] = useState<"whole" | "fromHere">(
		"fromHere",
	);

	const isRecurring = occurrence?.isRecurring ?? false;

	const utils = api.useUtils();

	const updateEvent = api.events.update.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.getById.invalidate();
			handleClose();
		},
	});

	const upsertOverride = api.events.upsertOverride.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.getById.invalidate();
			handleClose();
		},
	});

	const deleteOccurrence = api.events.deleteOccurrence.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			handleClose();
		},
	});

	const editSeriesFromDate = api.events.editSeriesFromDate.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.list.invalidate();
			handleClose();
		},
	});

	const deleteEvent = api.events.delete.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			handleClose();
		},
	});

	const occurrenceForm = useAppForm({
		defaultValues: {
			title: "",
			description: "",
			url: "",
			notes: "",
			status: "confirmed" as z.infer<typeof occurrenceFormSchema>["status"],
			startTime: "",
			endTime: "",
			hasEndTime: true as boolean,
		},
		validators: {
			onSubmit: occurrenceFormSchema,
		},
		onSubmit: async ({ value }) => {
			if (!occurrence) return;

			const startTime = value.startTime
				? parseLocalDateTime(value.startTime)
				: undefined;
			const endTime =
				value.hasEndTime && value.endTime
					? parseLocalDateTime(value.endTime)
					: undefined;

			upsertOverride.mutate({
				eventId: occurrence.eventId,
				occurrenceDate: occurrence.occurrenceDate,
				status: value.status,
				notes: value.notes || undefined,
				title: value.title || undefined,
				description: value.description || undefined,
				url: value.url || undefined,
				startTime,
				endTime,
			});
		},
	});

	const seriesForm = useAppForm({
		defaultValues: {
			title: "",
			description: "",
			url: "",
			status: "confirmed" as z.infer<typeof seriesFormSchema>["status"],
			seriesFirstDate: "",
			occurrenceStartTime: "",
			occurrenceEndTime: "",
			hasEndTime: true as boolean,
			seriesLastDate: "",
			seriesHasEndDate: false as boolean,
			recurrenceConfig: null as RecurrenceConfig | null,
		},
		validators: {
			onSubmit: seriesFormSchema,
		},
		onSubmit: async ({ value }) => {
			if (!occurrence) return;

			// Use seriesFirstDate when editing whole series, otherwise use current occurrence date
			const dateForTime =
				seriesEditScope === "whole" && value.seriesFirstDate
					? value.seriesFirstDate
					: occurrence.occurrenceDate;

			const startTime = value.occurrenceStartTime
				? combineDateAndTime(dateForTime, value.occurrenceStartTime)
				: undefined;
			const endTime =
				value.hasEndTime && value.occurrenceEndTime
					? combineDateAndTime(dateForTime, value.occurrenceEndTime)
					: undefined;

			const rrule = value.recurrenceConfig
				? buildRRuleFromConfig(value.recurrenceConfig)
				: undefined;

			let recurrenceEndDate: Date | undefined;
			if (value.recurrenceConfig) {
				if (value.seriesHasEndDate && value.seriesLastDate) {
					recurrenceEndDate = new Date(value.seriesLastDate);
				} else if (
					value.recurrenceConfig.endType === "date" &&
					value.recurrenceConfig.endDate
				) {
					recurrenceEndDate = value.recurrenceConfig.endDate;
				}
			}

			if (seriesEditScope === "whole") {
				updateEvent.mutate({
					id: occurrence.eventId,
					title: value.title,
					description: value.description || undefined,
					url: value.url || undefined,
					startTime,
					endTime,
					status: value.status,
					rrule,
					recurrenceEndDate,
				});
			} else {
				editSeriesFromDate.mutate({
					eventId: occurrence.eventId,
					splitDate: occurrence.start,
					title: value.title,
					description: value.description || undefined,
					url: value.url || undefined,
					startTime,
					endTime,
					status: value.status,
					rrule,
				});
			}
		},
	});

	const singleEventForm = useAppForm({
		defaultValues: {
			title: "",
			description: "",
			url: "",
			status: "confirmed" as z.infer<typeof singleEventFormSchema>["status"],
			startTime: "",
			endTime: "",
			hasEndTime: true as boolean,
		},
		validators: {
			onSubmit: singleEventFormSchema,
		},
		onSubmit: async ({ value }) => {
			if (!occurrence) return;

			const startTime = value.startTime
				? parseLocalDateTime(value.startTime)
				: undefined;
			const endTime =
				value.hasEndTime && value.endTime
					? parseLocalDateTime(value.endTime)
					: undefined;

			updateEvent.mutate({
				id: occurrence.eventId,
				title: value.title,
				description: value.description || undefined,
				url: value.url || undefined,
				startTime,
				endTime,
				status: value.status,
			});
		},
	});

	// Initialize recurrence config and tabs when occurrence changes
	useEffect(() => {
		if (occurrence?.rrule) {
			const editableStatus =
				occurrence.status === "gone" ? "cancelled" : occurrence.status;
			const configStatus =
				editableStatus === "cancelled" ? "pending" : editableStatus;
			seriesForm.setFieldValue(
				"recurrenceConfig",
				parseRRuleToConfig(occurrence.rrule, configStatus),
			);
		} else {
			seriesForm.setFieldValue("recurrenceConfig", null);
		}
		setEditTab(occurrence?.isRecurring ? "occurrence" : "series");
		setSeriesEditScope("fromHere");
	}, [occurrence, seriesForm.setFieldValue]);

	// Update form values when occurrence changes
	useEffect(() => {
		if (occurrence) {
			const editableStatus =
				occurrence.status === "gone" ? "cancelled" : occurrence.status;

			occurrenceForm.setFieldValue(
				"title",
				occurrence.isOverridden ? occurrence.title : "",
			);
			occurrenceForm.setFieldValue(
				"description",
				occurrence.isOverridden ? (occurrence.description ?? "") : "",
			);
			occurrenceForm.setFieldValue(
				"url",
				occurrence.isOverridden ? (occurrence.url ?? "") : "",
			);
			occurrenceForm.setFieldValue("notes", occurrence.notes ?? "");
			occurrenceForm.setFieldValue("status", editableStatus);
			occurrenceForm.setFieldValue(
				"startTime",
				toLocalDateTimeString(occurrence.start),
			);
			occurrenceForm.setFieldValue(
				"endTime",
				occurrence.end
					? toLocalDateTimeString(occurrence.end)
					: toLocalDateTimeString(
							new Date(occurrence.start.getTime() + 60 * 60 * 1000),
						),
			);
			occurrenceForm.setFieldValue("hasEndTime", !!occurrence.end);

			seriesForm.setFieldValue("title", occurrence.title);
			seriesForm.setFieldValue("description", occurrence.description ?? "");
			seriesForm.setFieldValue("url", occurrence.url ?? "");
			seriesForm.setFieldValue("status", editableStatus);
			seriesForm.setFieldValue("seriesFirstDate", occurrence.occurrenceDate);
			seriesForm.setFieldValue(
				"occurrenceStartTime",
				toLocalTimeString(occurrence.start),
			);
			seriesForm.setFieldValue(
				"occurrenceEndTime",
				occurrence.end
					? toLocalTimeString(occurrence.end)
					: toLocalTimeString(
							new Date(occurrence.start.getTime() + 60 * 60 * 1000),
						),
			);
			seriesForm.setFieldValue("hasEndTime", !!occurrence.end);
			seriesForm.setFieldValue("seriesHasEndDate", false);
			seriesForm.setFieldValue("seriesLastDate", "");

			// Single event form values
			singleEventForm.setFieldValue("title", occurrence.title);
			singleEventForm.setFieldValue(
				"description",
				occurrence.description ?? "",
			);
			singleEventForm.setFieldValue("url", occurrence.url ?? "");
			singleEventForm.setFieldValue("status", editableStatus);
			singleEventForm.setFieldValue(
				"startTime",
				toLocalDateTimeString(occurrence.start),
			);
			singleEventForm.setFieldValue(
				"endTime",
				occurrence.end
					? toLocalDateTimeString(occurrence.end)
					: toLocalDateTimeString(
							new Date(occurrence.start.getTime() + 60 * 60 * 1000),
						),
			);
			singleEventForm.setFieldValue("hasEndTime", !!occurrence.end);
		}
	}, [
		occurrence,
		occurrenceForm.setFieldValue,
		seriesForm.setFieldValue,
		singleEventForm.setFieldValue,
	]);

	const handleClose = () => {
		store.close();
		occurrenceForm.reset();
		seriesForm.reset();
		singleEventForm.reset();
	};

	const handleCancelOccurrence = () => {
		if (!occurrence) return;

		if (editTab === "occurrence") {
			upsertOverride.mutate({
				eventId: occurrence.eventId,
				occurrenceDate: occurrence.occurrenceDate,
				status: "cancelled",
			});
		} else {
			updateEvent.mutate({
				id: occurrence.eventId,
				status: "cancelled",
			});
		}
	};

	const handleDeleteOccurrence = () => {
		if (!occurrence) return;

		if (editTab === "occurrence") {
			if (!confirm("Delete this occurrence? This cannot be undone.")) return;
			deleteOccurrence.mutate({
				eventId: occurrence.eventId,
				occurrenceDate: occurrence.occurrenceDate,
			});
		} else {
			if (
				!confirm(
					isRecurring
						? "Delete this entire recurring event series? This cannot be undone."
						: "Delete this event? This cannot be undone.",
				)
			)
				return;
			deleteEvent.mutate({ id: occurrence.eventId });
		}
	};

	if (!occurrence) return null;

	return (
		<Dialog onOpenChange={handleClose} open={isOpen}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Edit Event</DialogTitle>
					{isRecurring && (
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
								style={{ backgroundColor: occurrence.eventType.color }}
							/>
						)}
						{occurrence.eventType?.name ?? "Unknown"}
					</div>
				</div>

				{isRecurring ? (
					<Tabs
						onValueChange={(v) => setEditTab(v as "occurrence" | "series")}
						value={editTab}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="occurrence">This Occurrence</TabsTrigger>
							<TabsTrigger value="series">Series</TabsTrigger>
						</TabsList>

						{/* Occurrence Tab */}
						<TabsContent className="space-y-4 pt-4" value="occurrence">
							<OccurrenceEditForm
								form={occurrenceForm}
								isDeletePending={deleteOccurrence.isPending}
								isPending={upsertOverride.isPending}
								occurrence={occurrence}
								onCancel={handleCancelOccurrence}
								onClose={handleClose}
								onDelete={handleDeleteOccurrence}
							/>
						</TabsContent>

						{/* Series Tab */}
						<TabsContent className="space-y-4 pt-4" value="series">
							<SeriesEditForm
								form={seriesForm}
								isDeletePending={deleteEvent.isPending}
								isPending={
									updateEvent.isPending || editSeriesFromDate.isPending
								}
								occurrence={occurrence}
								onCancel={handleCancelOccurrence}
								onClose={handleClose}
								onDelete={handleDeleteOccurrence}
								onScopeChange={setSeriesEditScope}
								seriesEditScope={seriesEditScope}
							/>
						</TabsContent>
					</Tabs>
				) : (
					<SingleEventEditForm
						form={singleEventForm}
						isDeletePending={deleteEvent.isPending}
						isPending={updateEvent.isPending}
						occurrence={occurrence}
						onCancel={handleCancelOccurrence}
						onClose={handleClose}
						onDelete={handleDeleteOccurrence}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

// Sub-components using withForm for type-safe form prop

const OccurrenceEditForm = withForm({
	defaultValues: {
		title: "",
		description: "",
		url: "",
		notes: "",
		status: "confirmed" as z.infer<typeof occurrenceFormSchema>["status"],
		startTime: "",
		endTime: "",
		hasEndTime: true as boolean,
	},
	props: {} as {
		occurrence: Occurrence;
		onCancel: () => void;
		onDelete: () => void;
		onClose: () => void;
		isPending: boolean;
		isDeletePending: boolean;
	},
	render: function OccurrenceEditForm({
		form,
		occurrence,
		onCancel,
		onDelete,
		onClose,
		isPending,
		isDeletePending,
	}) {
		return (
			<form.AppForm>
				<form.Form className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Changes only affect this specific occurrence. Leave fields empty to
						inherit from series.
					</p>

					<form.AppField name="title">
						{(field) => (
							<field.TextField label="Title" placeholder={occurrence.title} />
						)}
					</form.AppField>

					<form.AppField name="description">
						{(field) => (
							<field.TextareaField
								label="Description"
								placeholder="Leave empty to inherit from series"
								rows={2}
							/>
						)}
					</form.AppField>

					<form.AppField name="url">
						{(field) => (
							<>
								<field.TextField
									label="URL"
									placeholder="https://..."
									type="url"
								/>
								<field.FieldError />
							</>
						)}
					</form.AppField>

					<form.AppField name="status">
						{(field) => (
							<field.SelectField
								label="Status"
								options={[
									{ value: "confirmed", label: "Confirmed" },
									{ value: "tentative", label: "Tentative" },
									{ value: "pending", label: "Pending (Draft)" },
									{ value: "cancelled", label: "Cancelled" },
								]}
							/>
						)}
					</form.AppField>

					<form.AppField name="notes">
						{(field) => (
							<field.TextareaField
								label="Notes"
								placeholder="e.g., Moved due to holiday"
								rows={2}
							/>
						)}
					</form.AppField>

					<form.AppField name="startTime">
						{(field) => <field.DateTimeField label="Start Date & Time" />}
					</form.AppField>

					<form.AppField name="hasEndTime">
						{(field) => (
							<div className="space-y-2">
								<field.CheckboxField id="occ-hasEndTime" label="Has end time" />
								{form.state.values.hasEndTime && (
									<form.AppField name="endTime">
										{(endField) => <endField.DateTimeField label="End" />}
									</form.AppField>
								)}
							</div>
						)}
					</form.AppField>

					<div className="flex justify-between gap-2 border-t pt-4">
						<div className="flex gap-2">
							{occurrence.status !== "cancelled" && (
								<Button
									disabled={isPending}
									onClick={onCancel}
									type="button"
									variant="outline"
								>
									Cancel Occurrence
								</Button>
							)}
							<Button
								disabled={isDeletePending}
								onClick={onDelete}
								type="button"
								variant="destructive"
							>
								Delete Occurrence
							</Button>
						</div>
						<div className="flex gap-2">
							<Button onClick={onClose} type="button" variant="outline">
								Close
							</Button>
							<form.SubmitButton disabled={isPending || undefined}>
								{({ isSubmitting }) =>
									isSubmitting || isPending ? "Saving..." : "Save Override"
								}
							</form.SubmitButton>
						</div>
					</div>
				</form.Form>
			</form.AppForm>
		);
	},
});

const SeriesEditForm = withForm({
	defaultValues: {
		title: "",
		description: "",
		url: "",
		status: "confirmed" as z.infer<typeof seriesFormSchema>["status"],
		seriesFirstDate: "",
		occurrenceStartTime: "",
		occurrenceEndTime: "",
		hasEndTime: true as boolean,
		seriesLastDate: "",
		seriesHasEndDate: false as boolean,
		recurrenceConfig: null as RecurrenceConfig | null,
	},
	props: {} as {
		occurrence: Occurrence;
		seriesEditScope: "whole" | "fromHere";
		onScopeChange: (scope: "whole" | "fromHere") => void;
		onCancel: () => void;
		onDelete: () => void;
		onClose: () => void;
		isPending: boolean;
		isDeletePending: boolean;
	},
	render: function SeriesEditForm({
		form,
		occurrence,
		seriesEditScope,
		onScopeChange,
		onCancel,
		onDelete,
		onClose,
		isPending,
		isDeletePending,
	}) {
		return (
			<form.AppForm>
				<form.Form className="space-y-4">
					{/* Scope selection */}
					<div className="space-y-3 rounded-md border p-4">
						<Label>Apply changes to</Label>
						<div className="space-y-2">
							<label className="flex items-center gap-2">
								<input
									checked={seriesEditScope === "fromHere"}
									className="h-4 w-4"
									name="seriesScope"
									onChange={() => onScopeChange("fromHere")}
									type="radio"
								/>
								<span>This occurrence and onwards</span>
							</label>
							<label className="flex items-center gap-2">
								<input
									checked={seriesEditScope === "whole"}
									className="h-4 w-4"
									name="seriesScope"
									onChange={() => onScopeChange("whole")}
									type="radio"
								/>
								<span>Whole series (all occurrences)</span>
							</label>
						</div>
						{seriesEditScope === "fromHere" && (
							<p className="text-muted-foreground text-xs">
								This will split the series. Past occurrences will remain
								unchanged.
							</p>
						)}
					</div>

					{/* Series Date Range */}
					<div className="space-y-4 rounded-md border p-4">
						<h4 className="font-medium text-sm">Series Date Range</h4>
						<div className="grid grid-cols-2 gap-4">
							<form.AppField name="seriesFirstDate">
								{(field) => (
									<>
										<field.DateField
											description={
												seriesEditScope === "fromHere"
													? "New series starts from this date"
													: "Change to adjust when series starts"
											}
											disabled={seriesEditScope === "fromHere"}
											label="First Occurrence"
										/>
										<field.FieldError />
									</>
								)}
							</form.AppField>
							<form.AppField name="seriesHasEndDate">
								{(field) => (
									<div>
										<field.CheckboxField
											id="edit-seriesHasEndDate"
											label="Has end date"
										/>
										{form.state.values.seriesHasEndDate && (
											<form.AppField name="seriesLastDate">
												{(lastField) => (
													<lastField.DateField label="Last Occurrence" />
												)}
											</form.AppField>
										)}
									</div>
								)}
							</form.AppField>
						</div>
					</div>

					{/* Occurrence Times */}
					<div className="space-y-4 rounded-md border p-4">
						<h4 className="font-medium text-sm">Occurrence Times</h4>
						<p className="text-muted-foreground text-xs">
							Each occurrence will use these times
						</p>
						<div className="grid grid-cols-2 gap-4">
							<form.AppField name="occurrenceStartTime">
								{(field) => (
									<>
										<field.TimeField label="Start Time" required />
										<field.FieldError />
									</>
								)}
							</form.AppField>

							<form.AppField name="hasEndTime">
								{(field) => (
									<div>
										<field.CheckboxField
											id="edit-seriesHasEndTime"
											label="Has end time"
										/>
										{form.state.values.hasEndTime && (
											<form.AppField name="occurrenceEndTime">
												{(endField) => <endField.TimeField label="End Time" />}
											</form.AppField>
										)}
									</div>
								)}
							</form.AppField>
						</div>
					</div>

					{/* Recurrence Pattern */}
					{form.state.values.recurrenceConfig && (
						<form.AppField name="recurrenceConfig">
							{(field) => (
								<field.RecurrencePickerField startDate={occurrence.start} />
							)}
						</form.AppField>
					)}

					{/* Title */}
					<form.AppField name="title">
						{(field) => (
							<>
								<field.TextField label="Title" required />
								<field.FieldError />
							</>
						)}
					</form.AppField>

					{/* Description */}
					<form.AppField name="description">
						{(field) => <field.TextareaField label="Description" rows={2} />}
					</form.AppField>

					{/* URL */}
					<form.AppField name="url">
						{(field) => (
							<>
								<field.TextField
									label="URL"
									placeholder="https://..."
									type="url"
								/>
								<field.FieldError />
							</>
						)}
					</form.AppField>

					{/* Status */}
					<form.AppField name="status">
						{(field) => (
							<field.SelectField
								label="Status"
								options={[
									{ value: "confirmed", label: "Confirmed" },
									{ value: "tentative", label: "Tentative" },
									{ value: "pending", label: "Pending (Draft)" },
									{ value: "cancelled", label: "Cancelled" },
								]}
							/>
						)}
					</form.AppField>

					{/* Actions */}
					<div className="flex justify-between gap-2 border-t pt-4">
						<div className="flex gap-2">
							{occurrence.status !== "cancelled" && (
								<Button
									disabled={isPending}
									onClick={onCancel}
									type="button"
									variant="outline"
								>
									Cancel Series
								</Button>
							)}
							<Button
								disabled={isDeletePending}
								onClick={onDelete}
								type="button"
								variant="destructive"
							>
								Delete Series
							</Button>
						</div>
						<div className="flex gap-2">
							<Button onClick={onClose} type="button" variant="outline">
								Close
							</Button>
							<form.SubmitButton disabled={isPending || undefined}>
								{({ isSubmitting }) =>
									isSubmitting || isPending
										? "Saving..."
										: seriesEditScope === "whole"
											? "Update Series"
											: "Split & Update"
								}
							</form.SubmitButton>
						</div>
					</div>
				</form.Form>
			</form.AppForm>
		);
	},
});

const SingleEventEditForm = withForm({
	defaultValues: {
		title: "",
		description: "",
		url: "",
		status: "confirmed" as z.infer<typeof singleEventFormSchema>["status"],
		startTime: "",
		endTime: "",
		hasEndTime: true as boolean,
	},
	props: {} as {
		occurrence: Occurrence;
		onCancel: () => void;
		onDelete: () => void;
		onClose: () => void;
		isPending: boolean;
		isDeletePending: boolean;
	},
	render: function SingleEventEditForm({
		form,
		occurrence,
		onCancel,
		onDelete,
		onClose,
		isPending,
		isDeletePending,
	}) {
		return (
			<form.AppForm>
				<form.Form className="space-y-4">
					<form.AppField name="title">
						{(field) => (
							<>
								<field.TextField label="Title" required />
								<field.FieldError />
							</>
						)}
					</form.AppField>

					<form.AppField name="description">
						{(field) => <field.TextareaField label="Description" rows={2} />}
					</form.AppField>

					<form.AppField name="url">
						{(field) => (
							<>
								<field.TextField
									label="URL"
									placeholder="https://..."
									type="url"
								/>
								<field.FieldError />
							</>
						)}
					</form.AppField>

					<form.AppField name="status">
						{(field) => (
							<field.SelectField
								label="Status"
								options={[
									{ value: "confirmed", label: "Confirmed" },
									{ value: "tentative", label: "Tentative" },
									{ value: "pending", label: "Pending (Draft)" },
									{ value: "cancelled", label: "Cancelled" },
								]}
							/>
						)}
					</form.AppField>

					<form.AppField name="startTime">
						{(field) => (
							<>
								<field.DateTimeField label="Start Date & Time" required />
								<field.FieldError />
							</>
						)}
					</form.AppField>

					<form.AppField name="hasEndTime">
						{(field) => (
							<div className="space-y-2">
								<field.CheckboxField
									id="single-hasEndTime"
									label="Has end time"
								/>
								{form.state.values.hasEndTime && (
									<form.AppField name="endTime">
										{(endField) => (
											<endField.DateTimeField label="End Date & Time" />
										)}
									</form.AppField>
								)}
							</div>
						)}
					</form.AppField>

					<div className="flex justify-between gap-2 border-t pt-4">
						<div className="flex gap-2">
							{occurrence.status !== "cancelled" && (
								<Button
									disabled={isPending}
									onClick={onCancel}
									type="button"
									variant="outline"
								>
									Cancel Event
								</Button>
							)}
							<Button
								disabled={isDeletePending}
								onClick={onDelete}
								type="button"
								variant="destructive"
							>
								Delete Event
							</Button>
						</div>
						<div className="flex gap-2">
							<Button onClick={onClose} type="button" variant="outline">
								Close
							</Button>
							<form.SubmitButton disabled={isPending || undefined}>
								{({ isSubmitting }) =>
									isSubmitting || isPending ? "Saving..." : "Save Changes"
								}
							</form.SubmitButton>
						</div>
					</div>
				</form.Form>
			</form.AppForm>
		);
	},
});
