import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAppForm } from "@/hooks/form";
import { eventTypesKeys, eventTypesQueries } from "@/lib/queries/event-types";
import { update as updateEventTypeFn } from "@/server/fns/event-types";

const GLOBAL_VALUE = "__global__";

const formSchema = z.object({
    spaceId: z.string(),
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
    spaces: { id: string; slug: string; name: string }[];
};

export function EditEventTypeDialog({
    open,
    onOpenChange,
    eventType,
    spaces,
}: EditEventTypeDialogProps) {
    const queryClient = useQueryClient();

    // Where events of this type live decides which scopes are possible: a
    // type can always go global, but can only be limited to a space that
    // holds all of its events. (The delete impact query has exactly the
    // per-space counts needed.)
    const { data: usage } = useQuery({
        ...eventTypesQueries.deleteImpact(eventType?.id ?? ""),
        enabled: open && !!eventType,
    });
    const usedSlugs = new Set(
        (usage?.spaces ?? [])
            .filter((s) => s.singles + s.series > 0)
            .map((s) => s.slug),
    );
    const spaceOptions = [
        { value: GLOBAL_VALUE, label: "Global (available in all spaces)" },
        ...spaces.map((s) => ({
            value: s.id,
            label: s.name,
            // Usable only if no event of this type lives anywhere else
            disabled:
                usage === undefined ||
                [...usedSlugs].some((slug) => slug !== s.slug),
        })),
    ];
    const usedNames = spaces
        .filter((s) => usedSlugs.has(s.slug))
        .map((s) => s.name);
    const scopeHint =
        usedNames.length > 1
            ? `Events of this type exist in ${usedNames.join(", ")}, so it can only be global.`
            : usedNames.length === 1
              ? `Events of this type exist in ${usedNames[0]}, so it can only be global or limited to that space.`
              : undefined;

    const updateEventType = useMutation({
        mutationFn: (input: Parameters<typeof updateEventTypeFn>[0]["data"]) =>
            updateEventTypeFn({ data: input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: eventTypesKeys.all });
            onOpenChange(false);
        },
        onError: (error) =>
            toast.error(error.message || "Failed to update event type"),
    });

    const form = useAppForm({
        defaultValues: {
            spaceId: eventType?.spaceId ?? GLOBAL_VALUE,
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
                spaceId: value.spaceId === GLOBAL_VALUE ? null : value.spaceId,
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
            form.setFieldValue("spaceId", eventType.spaceId ?? GLOBAL_VALUE);
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

                            <form.AppField name="spaceId">
                                {(field) => (
                                    <field.SelectField
                                        description={scopeHint}
                                        label="Scope"
                                        options={spaceOptions}
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

                            <p className="text-muted-foreground text-sm">
                                Slug: /{eventType.slug} (read-only)
                            </p>

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
