"use client";

import { useEffect } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/form";
import { api } from "@/trpc/react";

import { parseLocalDateTime, toLocalDateTimeString } from "./date-utils";
import type { Occurrence } from "./types";

const formSchema = z.object({
	summary: z.string().min(1, "Title is required"),
	description: z.string(),
	url: z.string().url("Must be a valid URL").or(z.literal("")),
	location: z.string(),
	status: z.enum(["confirmed", "tentative", "cancelled"]),
	isDraft: z.boolean(),
	dtstart: z.string().min(1, "Start time is required"),
	dtend: z.string(),
	hasEndTime: z.boolean(),
});

type EditSingleEventFormProps = {
	occurrence: Occurrence;
	onClose: () => void;
};

export function EditSingleEventForm({
	occurrence,
	onClose,
}: EditSingleEventFormProps) {
	const utils = api.useUtils();

	const updateEvent = api.events.update.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			utils.events.getById.invalidate();
			onClose();
		},
	});

	const deleteEvent = api.events.delete.useMutation({
		onSuccess: () => {
			utils.events.getOccurrences.invalidate();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			summary: occurrence.summary,
			description: occurrence.description ?? "",
			url: occurrence.url ?? "",
			location: occurrence.location ?? "",
			status: occurrence.status,
			isDraft: occurrence.isDraft,
			dtstart: toLocalDateTimeString(occurrence.dtstart),
			dtend: occurrence.dtend
				? toLocalDateTimeString(occurrence.dtend)
				: toLocalDateTimeString(
						new Date(occurrence.dtstart.getTime() + 60 * 60 * 1000),
					),
			hasEndTime: !!occurrence.dtend,
		} as z.infer<typeof formSchema>,
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			const dtstart = value.dtstart
				? parseLocalDateTime(value.dtstart)
				: undefined;
			const dtend =
				value.hasEndTime && value.dtend
					? parseLocalDateTime(value.dtend)
					: undefined;

			updateEvent.mutate({
				id: occurrence.eventId,
				summary: value.summary,
				description: value.description || undefined,
				url: value.url || undefined,
				location: value.location || null,
				dtstart,
				dtend,
				status: value.status,
				isDraft: value.isDraft,
			});
		},
	});

	// Re-initialize form when occurrence changes (e.g. navigating between events)
	useEffect(() => {
		form.setFieldValue("summary", occurrence.summary);
		form.setFieldValue("description", occurrence.description ?? "");
		form.setFieldValue("url", occurrence.url ?? "");
		form.setFieldValue("location", occurrence.location ?? "");
		form.setFieldValue("status", occurrence.status);
		form.setFieldValue("isDraft", occurrence.isDraft);
		form.setFieldValue("dtstart", toLocalDateTimeString(occurrence.dtstart));
		form.setFieldValue(
			"dtend",
			occurrence.dtend
				? toLocalDateTimeString(occurrence.dtend)
				: toLocalDateTimeString(
						new Date(occurrence.dtstart.getTime() + 60 * 60 * 1000),
					),
		);
		form.setFieldValue("hasEndTime", !!occurrence.dtend);
	}, [occurrence, form.setFieldValue]);

	const handleCancel = () => {
		updateEvent.mutate({
			id: occurrence.eventId,
			status: "cancelled",
		});
	};

	const handleDelete = () => {
		if (!confirm("Delete this event? This cannot be undone.")) return;
		deleteEvent.mutate({ id: occurrence.eventId });
	};

	return (
		<form.AppForm>
			<form.Form className="space-y-4">
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
								label="URL"
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

				<form.AppField name="dtstart">
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
								<form.AppField name="dtend">
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
								disabled={updateEvent.isPending}
								onClick={handleCancel}
								type="button"
								variant="outline"
							>
								Cancel Event
							</Button>
						)}
						<Button
							disabled={deleteEvent.isPending}
							onClick={handleDelete}
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
						<form.SubmitButton disabled={updateEvent.isPending || undefined}>
							{({ isSubmitting }) =>
								isSubmitting || updateEvent.isPending
									? "Saving..."
									: "Save Changes"
							}
						</form.SubmitButton>
					</div>
				</div>
			</form.Form>
		</form.AppForm>
	);
}
