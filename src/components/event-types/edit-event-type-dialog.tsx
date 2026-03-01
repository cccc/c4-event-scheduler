"use client";

import { useEffect } from "react";
import { z } from "zod";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAppForm } from "@/hooks/form";
import { api } from "@/trpc/react";

const formSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string(),
    color: z.string(),
    isInternal: z.boolean(),
    defaultDurationMinutes: z.string(),
});

type EditEventType = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    color: string | null;
    isInternal: boolean;
    defaultDurationMinutes: number | null;
    spaceId: string | null;
};

type EditEventTypeDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventType: EditEventType | null;
};

export function EditEventTypeDialog({
    open,
    onOpenChange,
    eventType,
}: EditEventTypeDialogProps) {
    const utils = api.useUtils();

    const updateEventType = api.eventTypes.update.useMutation({
        onSuccess: () => {
            utils.eventTypes.list.invalidate();
            onOpenChange(false);
        },
    });

    const form = useAppForm({
        defaultValues: {
            name: eventType?.name ?? "",
            description: eventType?.description ?? "",
            color: eventType?.color ?? "#3498db",
            isInternal: eventType?.isInternal ?? false,
            defaultDurationMinutes:
                eventType?.defaultDurationMinutes?.toString() ?? "",
        } as z.infer<typeof formSchema>,
        validators: {
            onSubmit: formSchema,
        },
        onSubmit: async ({ value }) => {
            if (!eventType) return;
            updateEventType.mutate({
                id: eventType.id,
                name: value.name,
                description: value.description || undefined,
                color: value.color || undefined,
                isInternal: value.isInternal,
                defaultDurationMinutes: value.defaultDurationMinutes
                    ? Number(value.defaultDurationMinutes)
                    : null,
            });
        },
    });

    useEffect(() => {
        if (eventType) {
            form.setFieldValue("name", eventType.name);
            form.setFieldValue("description", eventType.description ?? "");
            form.setFieldValue("color", eventType.color ?? "#3498db");
            form.setFieldValue("isInternal", eventType.isInternal ?? false);
            form.setFieldValue(
                "defaultDurationMinutes",
                eventType.defaultDurationMinutes?.toString() ?? "",
            );
        }
    }, [eventType, form.setFieldValue]);

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Event Type</DialogTitle>
                </DialogHeader>
                {eventType && (
                    <form.AppForm>
                        <form.Form className="space-y-4">
                            <form.AppField name="name">
                                {(field) => (
                                    <>
                                        <field.TextField
                                            label="Name"
                                            required
                                        />
                                        <field.FieldError />
                                    </>
                                )}
                            </form.AppField>

                            <form.AppField name="description">
                                {(field) => (
                                    <field.TextField label="Description" />
                                )}
                            </form.AppField>

                            <form.AppField name="color">
                                {(field) => (
                                    <field.ColorSwatchField label="Color" />
                                )}
                            </form.AppField>

                            <form.AppField name="isInternal">
                                {(field) => (
                                    <field.CheckboxField
                                        id="edit-et-isInternal"
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

                            <div className="text-muted-foreground text-sm">
                                <p>Slug: /{eventType.slug} (read-only)</p>
                                {eventType.spaceId && (
                                    <p className="mt-1">
                                        This event type is limited to a specific
                                        space and cannot be made global.
                                    </p>
                                )}
                            </div>

                            <form.SubmitButton>
                                {({ isSubmitting }) =>
                                    isSubmitting || updateEventType.isPending
                                        ? "Saving..."
                                        : "Save Changes"
                                }
                            </form.SubmitButton>
                        </form.Form>
                    </form.AppForm>
                )}
            </DialogContent>
        </Dialog>
    );
}
