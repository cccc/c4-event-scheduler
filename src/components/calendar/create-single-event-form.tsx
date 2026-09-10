import { z } from "zod";

import { useAppTimezone } from "@/components/timezone-provider";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/form";
import { create as createEventFn } from "@/server/fns/events";

import {
    oneHourLater,
    parseLocalDateTime,
    toLocalDateTimeString,
} from "./date-utils";
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
import type { EventType, Space } from "./types";
import { useEventMutation } from "./use-event-mutation";

const formSchema = z.object({
    eventTypeId: z.string().min(1, "Event type is required"),
    ...eventBasicsShape,
    ...eventTimeShape,
    ...eventStatusShape,
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
    const tz = useAppTimezone();
    const createEvent = useEventMutation(createEventFn, onClose);

    const form = useAppForm({
        defaultValues: {
            eventTypeId: "",
            summary: "",
            description: "",
            url: "",
            location: "",
            dtstart: selectedDate
                ? toLocalDateTimeString(selectedDate, tz)
                : "",
            dtend: selectedDate
                ? toLocalDateTimeString(oneHourLater(selectedDate), tz)
                : "",
            hasEndTime: true,
            status: "confirmed",
            isDraft: false,
        } as z.infer<typeof formSchema>,
        validators: {
            onSubmit: formSchema,
        },
        onSubmit: async ({ value }) => {
            const dtstart = parseLocalDateTime(value.dtstart, tz);
            const dtend =
                value.hasEndTime && value.dtend
                    ? parseLocalDateTime(value.dtend, tz)
                    : undefined;

            return createEvent.mutate({
                spaceId: space.id,
                eventTypeId: value.eventTypeId,
                summary: value.summary,
                description: value.description || undefined,
                url: value.url || undefined,
                location: value.location || undefined,
                dtstart,
                dtend,
                status: value.status,
                isDraft: value.isDraft,
            });
        },
    });

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
                    urlLabel="URL (blog post, etc.)"
                />
                <form.Subscribe selector={(state) => state.values.eventTypeId}>
                    {(eventTypeId) => (
                        <EventTimeGroup
                            endHint={openEndHint(
                                eventTypes.find((et) => et.id === eventTypeId),
                            )}
                            fields={eventTimeFields}
                            form={form}
                            idPrefix="create-single"
                            startRequired
                        />
                    )}
                </form.Subscribe>
                <EventStatusGroup fields={eventStatusFields} form={form} />

                <div className="flex gap-2 pt-2">
                    <Button onClick={onClose} type="button" variant="outline">
                        Cancel
                    </Button>
                    <form.Subscribe selector={(state) => state.values.isDraft}>
                        {(isDraft) => (
                            <form.SubmitButton>
                                {({ isSubmitting }) =>
                                    isSubmitting || createEvent.isPending
                                        ? "Creating..."
                                        : isDraft
                                          ? "Create Draft"
                                          : "Create Event"
                                }
                            </form.SubmitButton>
                        )}
                    </form.Subscribe>
                </div>
            </form.Form>
        </form.AppForm>
    );
}
