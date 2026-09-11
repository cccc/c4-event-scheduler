import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppForm } from "@/hooks/form";
import { spacesKeys } from "@/lib/queries/spaces";
import { update as updateSpaceFn } from "@/server/fns/spaces";

const formSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string(),
    isPublic: z.boolean(),
});

export type EditSpace = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isPublic: boolean;
};

type EditSpaceDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    space: EditSpace | null;
};

export function EditSpaceDialog({
    open,
    onOpenChange,
    space,
}: EditSpaceDialogProps) {
    const queryClient = useQueryClient();

    const updateSpace = useMutation({
        mutationFn: (input: Parameters<typeof updateSpaceFn>[0]["data"]) =>
            updateSpaceFn({ data: input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: spacesKeys.all });
            onOpenChange(false);
        },
    });

    const form = useAppForm({
        defaultValues: {
            name: space?.name ?? "",
            description: space?.description ?? "",
            isPublic: space?.isPublic ?? true,
        } as z.infer<typeof formSchema>,
        validators: {
            onSubmit: formSchema,
        },
        onSubmit: async ({ value }) => {
            if (!space) return;
            updateSpace.mutate({
                id: space.id,
                name: value.name,
                description: value.description,
                isPublic: value.isPublic,
            });
        },
    });

    useEffect(() => {
        if (space) {
            form.reset({
                name: space.name,
                description: space.description ?? "",
                isPublic: space.isPublic,
            });
        }
    }, [space, form.reset]);

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Space</DialogTitle>
                </DialogHeader>
                {space && (
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

                            <div>
                                <Label>Slug</Label>
                                <Input disabled readOnly value={space.slug} />
                                <p className="mt-1 text-muted-foreground text-xs">
                                    The slug is part of feed URLs, links and
                                    permission scopes, so it cannot be changed.
                                </p>
                            </div>

                            <form.AppField name="description">
                                {(field) => (
                                    <field.TextField label="Description" />
                                )}
                            </form.AppField>

                            <form.AppField name="isPublic">
                                {(field) => (
                                    <field.CheckboxField
                                        id="edit-space-isPublic"
                                        label="Public"
                                    />
                                )}
                            </form.AppField>
                            <p className="text-muted-foreground text-xs">
                                Private spaces and their events are only visible
                                to signed-in users and API keys.
                            </p>

                            <form.SubmitButton>
                                {({ isSubmitting }) =>
                                    isSubmitting || updateSpace.isPending
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
