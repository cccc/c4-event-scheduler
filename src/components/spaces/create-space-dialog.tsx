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
    isPublic: z.boolean(),
});

type CreateSpaceDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function CreateSpaceDialog({
    open,
    onOpenChange,
}: CreateSpaceDialogProps) {
    const utils = api.useUtils();

    const createSpace = api.spaces.create.useMutation({
        onSuccess: () => {
            utils.spaces.list.invalidate();
            onOpenChange(false);
        },
    });

    const form = useAppForm({
        defaultValues: {
            name: "",
            slug: "",
            description: "",
            isPublic: true,
        } as z.infer<typeof formSchema>,
        validators: {
            onSubmit: formSchema,
        },
        onSubmit: async ({ value }) => {
            createSpace.mutate({
                name: value.name,
                slug: value.slug,
                description: value.description || undefined,
                isPublic: value.isPublic,
            });
        },
    });

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Space</DialogTitle>
                </DialogHeader>
                <form.AppForm>
                    <form.Form className="space-y-4">
                        <form.AppField name="name">
                            {(field) => (
                                <>
                                    <field.TextField label="Name" required />
                                    <field.FieldError />
                                </>
                            )}
                        </form.AppField>

                        <form.AppField name="slug">
                            {(field) => (
                                <>
                                    <field.TextField
                                        label="Slug"
                                        placeholder="my-space"
                                        required
                                    />
                                    <field.FieldError />
                                </>
                            )}
                        </form.AppField>

                        <form.AppField name="description">
                            {(field) => <field.TextField label="Description" />}
                        </form.AppField>

                        <form.AppField name="isPublic">
                            {(field) => (
                                <field.CheckboxField
                                    id="isPublic"
                                    label="Public"
                                />
                            )}
                        </form.AppField>

                        <form.SubmitButton>
                            {({ isSubmitting }) =>
                                isSubmitting || createSpace.isPending
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
