"use client";

import { z } from "zod";

import {
	buildRRuleFromConfig,
	type RecurrenceConfig,
} from "@/components/recurrence-picker";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/form";
import { api } from "@/trpc/react";

import {
	adjustEndDate,
	combineDateAndTime,
	parseDateAsEndOfDayInTz,
	toLocalDateString,
	toLocalTimeString,
} from "./date-utils";
import type { EventType, Space } from "./types";

const formSchema = z.object({
	eventTypeId: z.string().min(1, "Event type is required"),
	summary: z.string().min(1, "Title is required"),
	description: z.string(),
	url: z.url("Must be a valid URL").or(z.literal("")),
	location: z.string(),
	seriesFirstDate: z.string().min(1, "First occurrence date is required"),
	seriesLastDate: z.string(),
	seriesHasEndDate: z.boolean(),
	occurrenceStartTime: z.string().min(1, "Start time is required"),
	occurrenceEndTime: z.string(),
	seriesHasEndTime: z.boolean(),
	status: z.enum(["confirmed", "tentative", "cancelled"]),
	isDraft: z.boolean(),
	frequencyLabel: z.string(),
	recurrenceConfig: z.custom<RecurrenceConfig>().nullable(),
});

type CreateSeriesFormProps = {
	space: Space;
	selectedDate: Date | null;
	eventTypes: EventType[];
	onClose: () => void;
};

export function CreateSeriesForm({
	space,
	selectedDate,
	eventTypes,
	onClose,
}: CreateSeriesFormProps) {
	const utils = api.useUtils();

	const createEvent = api.events.create.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			eventTypeId: "",
			summary: "",
			description: "",
			url: "",
			location: "",
			seriesFirstDate: selectedDate ? toLocalDateString(selectedDate) : "",
			seriesLastDate: "",
			seriesHasEndDate: false,
			occurrenceStartTime: selectedDate
				? toLocalTimeString(selectedDate)
				: "19:00",
			occurrenceEndTime: selectedDate
				? toLocalTimeString(new Date(selectedDate.getTime() + 60 * 60 * 1000))
				: "21:00",
			seriesHasEndTime: true,
			status: "confirmed",
			isDraft: true,
			frequencyLabel: "",
			recurrenceConfig: null,
		} as z.infer<typeof formSchema>,
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			const dtstart = combineDateAndTime(
				value.seriesFirstDate,
				value.occurrenceStartTime,
			);
			const dtend =
				value.seriesHasEndTime && value.occurrenceEndTime
					? adjustEndDate(
							dtstart,
							combineDateAndTime(
								value.seriesFirstDate,
								value.occurrenceEndTime,
							),
						)
					: undefined;

			const rrule = value.recurrenceConfig
				? buildRRuleFromConfig(value.recurrenceConfig)
				: undefined;

			let recurrenceEndDate: Date | undefined;
			if (value.seriesHasEndDate && value.seriesLastDate) {
				recurrenceEndDate = parseDateAsEndOfDayInTz(value.seriesLastDate);
			} else if (
				value.recurrenceConfig?.endType === "date" &&
				value.recurrenceConfig.endDate
			) {
				recurrenceEndDate = value.recurrenceConfig.endDate;
			}

			createEvent.mutate({
				spaceId: space.id,
				eventTypeId: value.eventTypeId,
				summary: value.summary,
				description: value.description || undefined,
				url: value.url || undefined,
				location: value.location || undefined,
				dtstart,
				dtend,
				rrule,
				recurrenceEndDate,
				frequencyLabel: value.frequencyLabel || undefined,
				status: value.status,
				isDraft: value.isDraft,
			});
		},
	});

	const eventTypeOptions = eventTypes.map((et) => ({
		value: et.id,
		label: (
			<span className="flex items-center gap-2">
				{et.color && (
					<span
						className="h-3 w-3 rounded-full"
						style={{ backgroundColor: et.color }}
					/>
				)}
				{et.name}
			</span>
		),
	}));

	return (
		<form.AppForm>
			<form.Form className="space-y-4">
				<form.AppField name="eventTypeId">
					{(field) => (
						<>
							<field.SelectField
								label="Event Type"
								options={eventTypeOptions}
								placeholder="Select an event type"
							/>
							<field.FieldError />
						</>
					)}
				</form.AppField>

				<form.AppField name="summary">
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
								label="URL (blog post, etc.)"
								placeholder="https://..."
								type="url"
							/>
							<field.FieldError />
						</>
					)}
				</form.AppField>

				<form.AppField name="location">
					{(field) => (
						<field.TextField
							label="Location"
							placeholder="Leave empty to use space name"
						/>
					)}
				</form.AppField>

				{/* Series Date Range */}
				<div className="space-y-4 rounded-md border p-4">
					<h4 className="font-medium text-sm">Series Date Range</h4>
					<div className="grid grid-cols-2 gap-4">
						<form.AppField name="seriesFirstDate">
							{(field) => (
								<>
									<field.DateField label="First Occurrence" required />
									<field.FieldError />
								</>
							)}
						</form.AppField>

						<form.AppField name="seriesHasEndDate">
							{(field) => (
								<div>
									<field.CheckboxField
										id="seriesHasEndDate"
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

						<form.AppField name="seriesHasEndTime">
							{(field) => (
								<div>
									<field.CheckboxField
										id="seriesHasEndTime"
										label="Has end time"
									/>
									{form.state.values.seriesHasEndTime && (
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
				<form.AppField name="recurrenceConfig">
					{(field) => <field.RecurrencePickerField startDate={selectedDate} />}
				</form.AppField>

				<form.AppField name="status">
					{(field) => (
						<field.SelectField
							label="Status"
							options={[
								{ value: "confirmed", label: "Confirmed" },
								{ value: "tentative", label: "Tentative" },
								{ value: "cancelled", label: "Cancelled" },
							]}
						/>
					)}
				</form.AppField>

				<form.AppField name="isDraft">
					{(field) => (
						<field.CheckboxField
							id="isDraft"
							label="Draft (hidden from public feeds)"
						/>
					)}
				</form.AppField>

				{/* Frequency Label for Widget */}
				<form.AppField name="frequencyLabel">
					{(field) => (
						<field.TextField
							description="Human-readable frequency shown on the website"
							label="Display Label (for website widget)"
							placeholder="e.g., Jeden Donnerstag (~19 Uhr)"
						/>
					)}
				</form.AppField>

				<div className="flex gap-2 pt-2">
					<Button onClick={onClose} type="button" variant="outline">
						Cancel
					</Button>
					<form.SubmitButton disabled={createEvent.isPending}>
						{({ isSubmitting }) =>
							isSubmitting || createEvent.isPending
								? "Creating..."
								: "Create Series"
						}
					</form.SubmitButton>
				</div>
			</form.Form>
		</form.AppForm>
	);
}
