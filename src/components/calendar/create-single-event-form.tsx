"use client";

import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/form";
import { api } from "@/trpc/react";

import { parseLocalDateTime, toLocalDateTimeString } from "./date-utils";
import type { EventType, Space } from "./types";

const formSchema = z.object({
	eventTypeId: z.string().min(1, "Event type is required"),
	title: z.string().min(1, "Title is required"),
	description: z.string(),
	url: z.url("Must be a valid URL").or(z.literal("")),
	startTime: z.string().min(1, "Start time is required"),
	endTime: z.string(),
	hasEndTime: z.boolean(),
	status: z.enum(["confirmed", "tentative", "pending"]),
});

type CreateSingleEventFormProps = {
	space: Space;
	selectedDate: Date | null;
	eventTypes: EventType[];
	onClose: () => void;
};

export function CreateSingleEventForm({
	space,
	selectedDate,
	eventTypes,
	onClose,
}: CreateSingleEventFormProps) {
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
			title: "",
			description: "",
			url: "",
			startTime: selectedDate ? toLocalDateTimeString(selectedDate) : "",
			endTime: selectedDate
				? toLocalDateTimeString(
						new Date(selectedDate.getTime() + 60 * 60 * 1000),
					)
				: "",
			hasEndTime: true,
			status: "confirmed",
		} as z.infer<typeof formSchema>,
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			const startTime = parseLocalDateTime(value.startTime);
			const endTime =
				value.hasEndTime && value.endTime
					? parseLocalDateTime(value.endTime)
					: undefined;

			return createEvent.mutate({
				spaceId: space.id,
				eventTypeId: value.eventTypeId,
				title: value.title,
				description: value.description || undefined,
				url: value.url || undefined,
				startTime,
				endTime,
				status: value.status,
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
								label="URL (blog post, etc.)"
								placeholder="https://..."
								type="url"
							/>
							<field.FieldError />
						</>
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
							<field.CheckboxField id="hasEndTime" label="Has end time" />
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

				<form.AppField name="status">
					{(field) => (
						<field.SelectField
							label="Status"
							options={[
								{ value: "confirmed", label: "Confirmed" },
								{ value: "tentative", label: "Tentative" },
								{ value: "pending", label: "Pending (Draft)" },
							]}
						/>
					)}
				</form.AppField>

				<div className="flex gap-2 pt-2">
					<Button onClick={onClose} type="button" variant="outline">
						Cancel
					</Button>
					<form.SubmitButton>
						{({ isSubmitting }) =>
							isSubmitting || createEvent.isPending
								? "Creating..."
								: "Create Event"
						}
					</form.SubmitButton>
				</div>
			</form.Form>
		</form.AppForm>
	);
}
