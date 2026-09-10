import { z } from "zod";

import {
    buildRRuleFromConfig,
    type RecurrenceConfig,
} from "@/components/recurrence-picker";
import { useAppTimezone } from "@/components/timezone-provider";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/form";
import { create as createEventFn } from "@/server/fns/events";

import {
    adjustEndDate,
    combineDateAndTime,
    oneHourLater,
    parseDateAsEndOfDayInTz,
    toLocalDateString,
    toLocalTimeString,
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
    EventTypeGroup,
    eventTypeFields,
} from "./form-groups/event-type-group";
import {
    eventBasicsShape,
    eventStatusShape,
    seriesScheduleShape,
} from "./form-groups/schemas";
import {
    SeriesScheduleGroup,
    seriesScheduleFields,
} from "./form-groups/series-schedule-group";
import { openEndHint } from "./optional-end-field";
import type { EventType, Space } from "./types";
import { useEventMutation } from "./use-event-mutation";

const formSchema = z.object({
    eventTypeId: z.string().min(1, "Event type is required"),
    ...eventBasicsShape,
    ...seriesScheduleShape,
    ...eventStatusShape,
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
    const tz = useAppTimezone();
    const createEvent = useEventMutation(createEventFn, onClose);

    const form = useAppForm({
        defaultValues: {
            eventTypeId: "",
            summary: "",
            description: "",
            url: "",
            location: "",
            seriesFirstDate: selectedDate
                ? toLocalDateString(selectedDate, tz)
                : "",
            seriesLastDate: "",
            seriesHasEndDate: false,
            occurrenceStartTime: selectedDate
                ? toLocalTimeString(selectedDate, tz)
                : "19:00",
            occurrenceEndTime: selectedDate
                ? toLocalTimeString(oneHourLater(selectedDate), tz)
                : "21:00",
            hasEndTime: true,
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
                tz,
            );
            const dtend =
                value.hasEndTime && value.occurrenceEndTime
                    ? adjustEndDate(
                          dtstart,
                          combineDateAndTime(
                              value.seriesFirstDate,
                              value.occurrenceEndTime,
                              tz,
                          ),
                      )
                    : undefined;

            const rrule = value.recurrenceConfig
                ? buildRRuleFromConfig(value.recurrenceConfig)
                : undefined;

            let recurrenceEndDate: Date | undefined;
            if (value.seriesHasEndDate && value.seriesLastDate) {
                recurrenceEndDate = parseDateAsEndOfDayInTz(
                    value.seriesLastDate,
                    tz,
                );
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
                        <SeriesScheduleGroup
                            endHint={openEndHint(
                                eventTypes.find((et) => et.id === eventTypeId),
                            )}
                            fields={seriesScheduleFields}
                            firstDateRequired
                            form={form}
                            idPrefix="create-series"
                        />
                    )}
                </form.Subscribe>

                <form.AppField name="recurrenceConfig">
                    {(field) => (
                        <field.RecurrencePickerField startDate={selectedDate} />
                    )}
                </form.AppField>

                <EventStatusGroup fields={eventStatusFields} form={form} />

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
