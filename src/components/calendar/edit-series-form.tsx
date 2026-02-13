"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import {
	buildRRuleFromConfig,
	parseRRuleToConfig,
	type RecurrenceConfig,
} from "@/components/recurrence-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/form";
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
	location: z.string(),
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
	location: z.string(),
	status: z.enum(["confirmed", "tentative", "pending", "cancelled"]),
	seriesFirstDate: z.string().min(1, "First date is required"),
	occurrenceStartTime: z.string().min(1, "Start time is required"),
	occurrenceEndTime: z.string(),
	hasEndTime: z.boolean(),
	seriesLastDate: z.string(),
	seriesHasEndDate: z.boolean(),
	recurrenceConfig: z.custom<RecurrenceConfig>().nullable(),
});

type EditSeriesFormProps = {
	occurrence: Occurrence;
	onClose: () => void;
};

export function EditSeriesForm({ occurrence, onClose }: EditSeriesFormProps) {
	const [editTab, setEditTab] = useState<"occurrence" | "series">("occurrence");
	const [seriesEditScope, setSeriesEditScope] = useState<"whole" | "fromHere">(
		"fromHere",
	);

	const utils = api.useUtils();

	const updateEvent = api.events.update.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.getById.invalidate();
			onClose();
		},
	});

	const upsertOverride = api.events.upsertOverride.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.getById.invalidate();
			onClose();
		},
	});

	const deleteOccurrence = api.events.deleteOccurrence.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			onClose();
		},
	});

	const editSeriesFromDate = api.events.editSeriesFromDate.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.list.invalidate();
			onClose();
		},
	});

	const deleteEvent = api.events.delete.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			onClose();
		},
	});

	const editableStatus =
		occurrence.status === "gone" ? "cancelled" : occurrence.status;

	const occurrenceForm = useAppForm({
		defaultValues: {
			title: occurrence.isOverridden ? occurrence.title : "",
			description: occurrence.isOverridden
				? (occurrence.description ?? "")
				: "",
			url: occurrence.isOverridden ? (occurrence.url ?? "") : "",
			location: occurrence.isOverridden ? (occurrence.location ?? "") : "",
			notes: occurrence.notes ?? "",
			status: editableStatus,
			startTime: toLocalDateTimeString(occurrence.start),
			endTime: occurrence.end
				? toLocalDateTimeString(occurrence.end)
				: toLocalDateTimeString(
						new Date(occurrence.start.getTime() + 60 * 60 * 1000),
					),
			hasEndTime: !!occurrence.end,
		} as z.infer<typeof occurrenceFormSchema>,
		validators: {
			onSubmit: occurrenceFormSchema,
		},
		onSubmit: async ({ value }) => {
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
				location: value.location || undefined,
				startTime,
				endTime,
			});
		},
	});

	const seriesForm = useAppForm({
		defaultValues: {
			title: occurrence.title,
			description: occurrence.description ?? "",
			url: occurrence.url ?? "",
			location: occurrence.location ?? "",
			status: editableStatus,
			seriesFirstDate: occurrence.occurrenceDate,
			occurrenceStartTime: toLocalTimeString(occurrence.start),
			occurrenceEndTime: occurrence.end
				? toLocalTimeString(occurrence.end)
				: toLocalTimeString(
						new Date(occurrence.start.getTime() + 60 * 60 * 1000),
					),
			hasEndTime: !!occurrence.end,
			seriesLastDate: "",
			seriesHasEndDate: false,
			recurrenceConfig: occurrence.rrule
				? parseRRuleToConfig(occurrence.rrule)
				: null,
		} as z.infer<typeof seriesFormSchema>,
		validators: {
			onSubmit: seriesFormSchema,
		},
		onSubmit: async ({ value }) => {
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
					location: value.location || null,
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
					location: value.location || undefined,
					startTime,
					endTime,
					status: value.status,
					rrule,
				});
			}
		},
	});

	// Re-initialize forms when occurrence changes
	useEffect(() => {
		const status =
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
		occurrenceForm.setFieldValue(
			"location",
			occurrence.isOverridden ? (occurrence.location ?? "") : "",
		);
		occurrenceForm.setFieldValue("notes", occurrence.notes ?? "");
		occurrenceForm.setFieldValue("status", status);
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
		seriesForm.setFieldValue("location", occurrence.location ?? "");
		seriesForm.setFieldValue("status", status);
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

		if (occurrence.rrule) {
			seriesForm.setFieldValue(
				"recurrenceConfig",
				parseRRuleToConfig(occurrence.rrule),
			);
		} else {
			seriesForm.setFieldValue("recurrenceConfig", null);
		}

		setEditTab("occurrence");
		setSeriesEditScope("fromHere");
	}, [occurrence, occurrenceForm.setFieldValue, seriesForm.setFieldValue]);

	const handleCancelOccurrence = () => {
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
		if (editTab === "occurrence") {
			if (!confirm("Delete this occurrence? This cannot be undone.")) return;
			deleteOccurrence.mutate({
				eventId: occurrence.eventId,
				occurrenceDate: occurrence.occurrenceDate,
			});
		} else {
			if (
				!confirm(
					"Delete this entire recurring event series? This cannot be undone.",
				)
			)
				return;
			deleteEvent.mutate({ id: occurrence.eventId });
		}
	};

	const occIsPending = upsertOverride.isPending;
	const occIsDeletePending = deleteOccurrence.isPending;
	const seriesIsPending = updateEvent.isPending || editSeriesFromDate.isPending;
	const seriesIsDeletePending = deleteEvent.isPending;

	return (
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
				<occurrenceForm.AppForm>
					<occurrenceForm.Form className="space-y-4">
						<p className="text-muted-foreground text-sm">
							Changes only affect this specific occurrence. Leave fields empty
							to inherit from series.
						</p>

						<occurrenceForm.AppField name="title">
							{(field) => (
								<field.TextField label="Title" placeholder={occurrence.title} />
							)}
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="description">
							{(field) => (
								<field.TextareaField
									label="Description"
									placeholder="Leave empty to inherit from series"
									rows={2}
								/>
							)}
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="url">
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
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="location">
							{(field) => (
								<field.TextField
									label="Location"
									placeholder="Leave empty to inherit from series"
								/>
							)}
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="notes">
							{(field) => (
								<field.TextareaField
									label="Notes"
									placeholder="e.g., Moved due to holiday"
									rows={2}
								/>
							)}
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="startTime">
							{(field) => <field.DateTimeField label="Start Date & Time" />}
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="hasEndTime">
							{(field) => (
								<div className="space-y-2">
									<field.CheckboxField
										id="occ-hasEndTime"
										label="Has end time"
									/>
									{occurrenceForm.state.values.hasEndTime && (
										<occurrenceForm.AppField name="endTime">
											{(endField) => <endField.DateTimeField label="End" />}
										</occurrenceForm.AppField>
									)}
								</div>
							)}
						</occurrenceForm.AppField>

						<occurrenceForm.AppField name="status">
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
						</occurrenceForm.AppField>

						<div className="flex justify-between gap-2 border-t pt-4">
							<div className="flex gap-2">
								{occurrence.status !== "cancelled" && (
									<Button
										disabled={occIsPending}
										onClick={handleCancelOccurrence}
										type="button"
										variant="outline"
									>
										Cancel Occurrence
									</Button>
								)}
								<Button
									disabled={occIsDeletePending}
									onClick={handleDeleteOccurrence}
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
								<occurrenceForm.SubmitButton
									disabled={occIsPending || undefined}
								>
									{({ isSubmitting }) =>
										isSubmitting || occIsPending ? "Saving..." : "Save Override"
									}
								</occurrenceForm.SubmitButton>
							</div>
						</div>
					</occurrenceForm.Form>
				</occurrenceForm.AppForm>
			</TabsContent>

			{/* Series Tab */}
			<TabsContent className="space-y-4 pt-4" value="series">
				<seriesForm.AppForm>
					<seriesForm.Form className="space-y-4">
						{/* Scope selection */}
						<div className="space-y-3 rounded-md border p-4">
							<Label>Apply changes to</Label>
							<div className="space-y-2">
								<label className="flex items-center gap-2">
									<input
										checked={seriesEditScope === "fromHere"}
										className="h-4 w-4"
										name="seriesScope"
										onChange={() => setSeriesEditScope("fromHere")}
										type="radio"
									/>
									<span>This occurrence and onwards</span>
								</label>
								<label className="flex items-center gap-2">
									<input
										checked={seriesEditScope === "whole"}
										className="h-4 w-4"
										name="seriesScope"
										onChange={() => setSeriesEditScope("whole")}
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

						{/* Title */}
						<seriesForm.AppField name="title">
							{(field) => (
								<>
									<field.TextField label="Title" required />
									<field.FieldError />
								</>
							)}
						</seriesForm.AppField>

						{/* Description */}
						<seriesForm.AppField name="description">
							{(field) => <field.TextareaField label="Description" rows={2} />}
						</seriesForm.AppField>

						{/* URL */}
						<seriesForm.AppField name="url">
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
						</seriesForm.AppField>

						{/* Location */}
						<seriesForm.AppField name="location">
							{(field) => (
								<field.TextField
									label="Location"
									placeholder="Leave empty to use space name"
								/>
							)}
						</seriesForm.AppField>

						{/* Series Date Range */}
						<div className="space-y-4 rounded-md border p-4">
							<h4 className="font-medium text-sm">Series Date Range</h4>
							<div className="grid grid-cols-2 gap-4">
								<seriesForm.AppField name="seriesFirstDate">
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
								</seriesForm.AppField>
								<seriesForm.AppField name="seriesHasEndDate">
									{(field) => (
										<div>
											<field.CheckboxField
												id="edit-seriesHasEndDate"
												label="Has end date"
											/>
											{seriesForm.state.values.seriesHasEndDate && (
												<seriesForm.AppField name="seriesLastDate">
													{(lastField) => (
														<lastField.DateField label="Last Occurrence" />
													)}
												</seriesForm.AppField>
											)}
										</div>
									)}
								</seriesForm.AppField>
							</div>
						</div>

						{/* Occurrence Times */}
						<div className="space-y-4 rounded-md border p-4">
							<h4 className="font-medium text-sm">Occurrence Times</h4>
							<p className="text-muted-foreground text-xs">
								Each occurrence will use these times
							</p>
							<div className="grid grid-cols-2 gap-4">
								<seriesForm.AppField name="occurrenceStartTime">
									{(field) => (
										<>
											<field.TimeField label="Start Time" required />
											<field.FieldError />
										</>
									)}
								</seriesForm.AppField>

								<seriesForm.AppField name="hasEndTime">
									{(field) => (
										<div>
											<field.CheckboxField
												id="edit-seriesHasEndTime"
												label="Has end time"
											/>
											{seriesForm.state.values.hasEndTime && (
												<seriesForm.AppField name="occurrenceEndTime">
													{(endField) => (
														<endField.TimeField label="End Time" />
													)}
												</seriesForm.AppField>
											)}
										</div>
									)}
								</seriesForm.AppField>
							</div>
						</div>

						{/* Recurrence Pattern */}
						{seriesForm.state.values.recurrenceConfig && (
							<seriesForm.AppField name="recurrenceConfig">
								{(field) => (
									<field.RecurrencePickerField startDate={occurrence.start} />
								)}
							</seriesForm.AppField>
						)}

						{/* Status */}
						<seriesForm.AppField name="status">
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
						</seriesForm.AppField>

						{/* Actions */}
						<div className="flex justify-between gap-2 border-t pt-4">
							<div className="flex gap-2">
								{occurrence.status !== "cancelled" && (
									<Button
										disabled={seriesIsPending}
										onClick={handleCancelOccurrence}
										type="button"
										variant="outline"
									>
										Cancel Series
									</Button>
								)}
								<Button
									disabled={seriesIsDeletePending}
									onClick={handleDeleteOccurrence}
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
								<seriesForm.SubmitButton
									disabled={seriesIsPending || undefined}
								>
									{({ isSubmitting }) =>
										isSubmitting || seriesIsPending
											? "Saving..."
											: seriesEditScope === "whole"
												? "Update Series"
												: "Split & Update"
									}
								</seriesForm.SubmitButton>
							</div>
						</div>
					</seriesForm.Form>
				</seriesForm.AppForm>
			</TabsContent>
		</Tabs>
	);
}
