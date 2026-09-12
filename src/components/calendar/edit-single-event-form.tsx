import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";

import { useAppTimezone } from "@/components/timezone-provider";
import { useAppForm } from "@/hooks/form";
import { eventTypesQueries } from "@/lib/queries/event-types";
import {
    deleteEvent as deleteEventFn,
    update as updateEventFn,
} from "@/server/fns/events";

import {
    oneHourLater,
    parseLocalDateTime,
    toLocalDateTimeString,
} from "./date-utils";
import { EditActions } from "./edit-actions";
import {
    EventBasicsGroup,
    eventBasicsFields,
} from "./form-groups/event-basics-group";
import {
    EventStatusGroup,
    eventStatusFields,
} from "./form-groups/event-status-group";
import {
    EventTimeGroup,
    eventTimeFields,
} from "./form-groups/event-time-group";
import {
    EventTypeGroup,
    eventTypeFields,
} from "./form-groups/event-type-group";
import {
    eventBasicsShape,
    eventStatusShape,
    eventTimeShape,
} from "./form-groups/schemas";
import { openEndHint } from "./optional-end-field";
import type { Occurrence } from "./types";
import { useEventMutation } from "./use-event-mutation";

const formSchema = z.object({
    eventTypeId: z.string().min(1, "Event type is required"),
    ...eventBasicsShape,
    ...eventTimeShape,
    ...eventStatusShape,
});

function initialValues(
    occurrence: Occurrence,
    tz: string,
): z.infer<typeof formSchema> {
    return {
        eventTypeId: occurrence.eventType?.id ?? "",
        summary: occurrence.summary,
        description: occurrence.description ?? "",
        url: occurrence.url ?? "",
        location: occurrence.location ?? "",
        dtstart: toLocalDateTimeString(occurrence.dtstart, tz),
        dtend: toLocalDateTimeString(
            occurrence.dtend ?? oneHourLater(occurrence.dtstart),
            tz,
        ),
        hasEndTime: !!occurrence.dtend,
        status: occurrence.status,
        isDraft: occurrence.isDraft,
    };
}

type EditSingleEventFormProps = {
    occurrence: Occurrence;
    onClose: () => void;
};

export function EditSingleEventForm({
    occurrence,
    onClose,
}: EditSingleEventFormProps) {
    const tz = useAppTimezone();
    const updateEvent = useEventMutation(updateEventFn, onClose);
    const deleteEvent = useEventMutation(deleteEventFn, onClose);
    // Types usable in this space: global ones plus the space's own
    const { data: eventTypes = [] } = useQuery(
        eventTypesQueries.list({ spaceId: occurrence.space.id }),
    );

    const form = useAppForm({
        defaultValues: initialValues(occurrence, tz),
        validators: {
            onSubmit: formSchema,
        },
        onSubmit: async ({ value }) => {
            const dtstart = value.dtstart
                ? parseLocalDateTime(value.dtstart, tz)
                : undefined;
            const dtend =
                value.hasEndTime && value.dtend
                    ? parseLocalDateTime(value.dtend, tz)
                    : undefined;

            updateEvent.mutate({
                id: occurrence.eventId,
                eventTypeId: value.eventTypeId,
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
        form.reset(initialValues(occurrence, tz));
    }, [occurrence, form.reset, tz]);

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
                <EventTypeGroup
                    eventTypes={eventTypes}
                    fields={eventTypeFields}
                    form={form}
                />
                <EventBasicsGroup
                    fields={eventBasicsFields}
                    form={form}
                    titleRequired
                />
                <form.Subscribe selector={(state) => state.values.eventTypeId}>
                    {(eventTypeId) => (
                        <EventTimeGroup
                            endHint={openEndHint(
                                eventTypes.find(
                                    (et) => et.id === eventTypeId,
                                ) ?? occurrence.eventType,
                            )}
                            fields={eventTimeFields}
                            form={form}
                            idPrefix="edit-single"
                            startRequired
                        />
                    )}
                </form.Subscribe>
                <EventStatusGroup fields={eventStatusFields} form={form} />

                <EditActions
                    canCancel={occurrence.status !== "cancelled"}
                    cancelLabel="Cancel Event"
                    deleteLabel="Delete Event"
                    deletePending={deleteEvent.isPending}
                    onCancel={handleCancel}
                    onClose={onClose}
                    onDelete={handleDelete}
                    pending={updateEvent.isPending}
                >
                    <form.Subscribe selector={(state) => state.values.isDraft}>
                        {(isDraft) => (
                            <form.SubmitButton
                                disabled={updateEvent.isPending || undefined}
                            >
                                {({ isSubmitting }) =>
                                    isSubmitting || updateEvent.isPending
                                        ? "Saving..."
                                        : isDraft
                                          ? "Save Draft"
                                          : "Save Changes"
                                }
                            </form.SubmitButton>
                        )}
                    </form.Subscribe>
                </EditActions>
            </form.Form>
        </form.AppForm>
    );
}
