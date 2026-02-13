"use client";

import { z } from "zod";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useAppForm } from "@/hooks/form";
import { api } from "@/trpc/react";

const GLOBAL_VALUE = "__global__";

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	slug: z
		.string()
		.min(1, "Slug is required")
		.regex(
			/^[a-z0-9-]+$/,
			"Slug must contain only lowercase letters, numbers, and hyphens",
		),
	description: z.string(),
	color: z.string(),
	isInternal: z.boolean(),
	defaultDurationMinutes: z.string(),
	spaceId: z.string(),
});

type Space = {
	id: string;
	name: string;
};

type CreateEventTypeDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	spaces: Space[];
};

export function CreateEventTypeDialog({
	open,
	onOpenChange,
	spaces,
}: CreateEventTypeDialogProps) {
	const utils = api.useUtils();

	const createEventType = api.eventTypes.create.useMutation({
		onSuccess: () => {
			utils.eventTypes.list.invalidate();
			onOpenChange(false);
		},
	});

	const spaceOptions = [
		{ value: GLOBAL_VALUE, label: "Global (available in all spaces)" },
		...spaces.map((s) => ({ value: s.id, label: s.name })),
	];

	const form = useAppForm({
		defaultValues: {
			name: "",
			slug: "",
			description: "",
			color: "#3498db",
			isInternal: false,
			defaultDurationMinutes: "",
			spaceId: GLOBAL_VALUE,
		} as z.infer<typeof formSchema>,
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			createEventType.mutate({
				name: value.name,
				slug: value.slug,
				description: value.description || undefined,
				color: value.color || undefined,
				isInternal: value.isInternal,
				defaultDurationMinutes: value.defaultDurationMinutes
					? Number(value.defaultDurationMinutes)
					: undefined,
				spaceId: value.spaceId === GLOBAL_VALUE ? undefined : value.spaceId,
			});
		},
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Event Type</DialogTitle>
				</DialogHeader>
				<form.AppForm>
					<form.Form className="space-y-4">
						<form.AppField name="name">
							{(field) => (
								<>
									<field.TextField
										label="Name"
										placeholder="e.g., User Group Meetup"
										required
									/>
									<field.FieldError />
								</>
							)}
						</form.AppField>

						<form.AppField name="slug">
							{(field) => (
								<>
									<field.TextField
										label="Slug"
										placeholder="e.g., user-group-meetup"
										required
									/>
									<field.FieldError />
								</>
							)}
						</form.AppField>

						<form.AppField name="description">
							{(field) => <field.TextField label="Description" />}
						</form.AppField>

						<form.AppField name="color">
							{(field) => <field.ColorSwatchField label="Color" />}
						</form.AppField>

						<form.AppField name="isInternal">
							{(field) => (
								<field.CheckboxField
									id="create-et-isInternal"
									label="Internal (hidden from public feeds)"
								/>
							)}
						</form.AppField>

						<form.AppField name="defaultDurationMinutes">
							{(field) => (
								<field.TextField
									label="Default Duration (minutes)"
									placeholder="e.g. 120"
									type="number"
								/>
							)}
						</form.AppField>

						<form.AppField name="spaceId">
							{(field) => (
								<field.SelectField
									label="Limit to Space (optional)"
									options={spaceOptions}
								/>
							)}
						</form.AppField>

						<form.SubmitButton>
							{({ isSubmitting }) =>
								isSubmitting || createEventType.isPending
									? "Creating..."
									: "Create"
							}
						</form.SubmitButton>
					</form.Form>
				</form.AppForm>
			</DialogContent>
		</Dialog>
	);
}
