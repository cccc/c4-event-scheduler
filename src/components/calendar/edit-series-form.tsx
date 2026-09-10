import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
    buildRRuleFromConfig,
    parseRRuleToConfig,
    type RecurrenceConfig,
} from "@/components/recurrence-picker";
import { useAppTimezone } from "@/components/timezone-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/form";
import { eventsQueries } from "@/lib/queries/events";
import {
    deleteEvent as deleteEventFn,
    deleteOccurrence as deleteOccurrenceFn,
    editSeriesFromDate as editSeriesFromDateFn,
    update as updateEventFn,
    upsertOverride as upsertOverrideFn,
} from "@/server/fns/events";

import {
    adjustEndDate,
    combineDateAndTime,
    oneHourLater,
    parseDateAsEndOfDayInTz,
    parseLocalDateTime,
    toLocalDateString,
    toLocalDateTimeString,
    toLocalTimeString,
} from "./date-utils";
import { EditActions } from "./edit-actions";
import {
    EventBasicsGroup,
    eventBasicsFields,
} from "./form-groups/event-basics-group";
import {
    EventStatusGroup,
    eventStatusFields,
    STATUS_OPTIONS,
} from "./form-groups/event-status-group";
import {
    EventTimeGroup,
    eventTimeFields,
} from "./form-groups/event-time-group";
import {
    eventBasicsShape,
    eventStatusShape,
    optionalEventBasicsShape,
    optionalEventTimeShape,
    seriesScheduleShape,
    statusSchema,
} from "./form-groups/schemas";
import {
    SeriesScheduleGroup,
    seriesScheduleFields,
} from "./form-groups/series-schedule-group";
import { openEndHint } from "./optional-end-field";
import type { Occurrence } from "./types";
import { useEventMutation } from "./use-event-mutation";

const occurrenceFormSchema = z.object({
    ...optionalEventBasicsShape,
    notes: z.string(),
    status: statusSchema,
    ...optionalEventTimeShape,
});

const seriesFormSchema = z.object({
    ...eventBasicsShape,
    ...eventStatusShape,
    ...seriesScheduleShape,
    recurrenceConfig: z.custom<RecurrenceConfig>().nullable(),
});

type EditTab = "occurrence" | "fromHere" | "whole";

// Override form: only fields the override itself sets are filled in,
// empty fields inherit from the series
function occurrenceInitialValues(
    occurrence: Occurrence,
    tz: string,
): z.infer<typeof occurrenceFormSchema> {
    const own = occurrence.isOverridden;
    return {
        summary: own ? occurrence.summary : "",
        description: own ? (occurrence.description ?? "") : "",
        url: own ? (occurrence.url ?? "") : "",
        location: own ? (occurrence.location ?? "") : "",
        notes: occurrence.notes ?? "",
        status: occurrence.status,
        dtstart: toLocalDateTimeString(occurrence.dtstart, tz),
        dtend: toLocalDateTimeString(
            occurrence.dtend ?? oneHourLater(occurrence.dtstart),
            tz,
        ),
        hasEndTime: own && !!occurrence.dtend,
    };
}

function seriesInitialValues(
    occurrence: Occurrence,
    tz: string,
): z.infer<typeof seriesFormSchema> {
    return {
        summary: occurrence.summary,
        description: occurrence.description ?? "",
        url: occurrence.url ?? "",
        location: occurrence.location ?? "",
        status: occurrence.status,
        isDraft: occurrence.isDraft,
        seriesFirstDate: occurrence.occurrenceDate,
        seriesLastDate: "",
        seriesHasEndDate: false,
        occurrenceStartTime: toLocalTimeString(occurrence.dtstart, tz),
        occurrenceEndTime: toLocalTimeString(
            occurrence.dtend ?? oneHourLater(occurrence.dtstart),
            tz,
        ),
        hasEndTime: !!occurrence.dtend,
        recurrenceConfig: occurrence.rrule
            ? parseRRuleToConfig(occurrence.rrule)
            : null,
    };
}

type EditSeriesFormProps = {
    occurrence: Occurrence;
    onClose: () => void;
    initialTab?: EditTab;
};

export function EditSeriesForm({
    occurrence,
    onClose,
    initialTab,
}: EditSeriesFormProps) {
    const tz = useAppTimezone();
    const [editTab, setEditTab] = useState<EditTab>(initialTab ?? "occurrence");

    // Fetch the actual event data so "Whole Series" mode can use the real series start date
    const { data: eventData } = useQuery(
        eventsQueries.getById(occurrence.eventId),
    );

    const updateEvent = useEventMutation(updateEventFn, onClose);
    const upsertOverride = useEventMutation(upsertOverrideFn, onClose);
    const deleteOccurrence = useEventMutation(deleteOccurrenceFn, onClose);
    const editSeriesFromDate = useEventMutation(editSeriesFromDateFn, onClose);
    const deleteEvent = useEventMutation(deleteEventFn, onClose);

    const occurrenceForm = useAppForm({
        defaultValues: occurrenceInitialValues(occurrence, tz),
        validators: {
            onSubmit: occurrenceFormSchema,
        },
        onSubmit: async ({ value }) => {
            const dtstart = parseLocalDateTime(value.dtstart, tz);
            const dtend =
                value.hasEndTime && value.dtend
                    ? parseLocalDateTime(value.dtend, tz)
                    : null;

            upsertOverride.mutate({
                eventId: occurrence.eventId,
                occurrenceDate: occurrence.occurrenceDate,
                status: value.status,
                notes: value.notes || undefined,
                summary: value.summary || undefined,
                description: value.description || undefined,
                url: value.url || undefined,
                location: value.location || undefined,
                // Send null to explicitly clear stored override time (inherit from series).
                // Send the value only when it actually differs from the computed occurrence time.
                dtstart:
                    dtstart.getTime() !== occurrence.dtstart.getTime()
                        ? dtstart
                        : null,
                dtend:
                    dtend?.getTime() !== occurrence.dtend?.getTime()
                        ? dtend
                        : null,
            });
        },
    });

    const seriesForm = useAppForm({
        defaultValues: seriesInitialValues(occurrence, tz),
        validators: {
            onSubmit: seriesFormSchema,
        },
        onSubmit: async ({ value }) => {
            const dateForTime =
                editTab === "whole" && value.seriesFirstDate
                    ? value.seriesFirstDate
                    : occurrence.occurrenceDate;

            const dtstart = value.occurrenceStartTime
                ? combineDateAndTime(dateForTime, value.occurrenceStartTime, tz)
                : undefined;
            const dtend =
                value.hasEndTime && value.occurrenceEndTime && dtstart
                    ? adjustEndDate(
                          dtstart,
                          combineDateAndTime(
                              dateForTime,
                              value.occurrenceEndTime,
                              tz,
                          ),
                      )
                    : undefined;

            const rrule = value.recurrenceConfig
                ? buildRRuleFromConfig(value.recurrenceConfig)
                : undefined;

            let recurrenceEndDate: Date | undefined;
            if (value.recurrenceConfig) {
                if (value.seriesHasEndDate && value.seriesLastDate) {
                    recurrenceEndDate = parseDateAsEndOfDayInTz(
                        value.seriesLastDate,
                        tz,
                    );
                } else if (
                    value.recurrenceConfig.endType === "date" &&
                    value.recurrenceConfig.endDate
                ) {
                    recurrenceEndDate = value.recurrenceConfig.endDate;
                }
            }

            if (editTab === "whole") {
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
                    rrule,
                    recurrenceEndDate,
                });
            } else {
                editSeriesFromDate.mutate({
                    eventId: occurrence.eventId,
                    splitDate: occurrence.dtstart,
                    summary: value.summary,
                    description: value.description || undefined,
                    url: value.url || undefined,
                    location: value.location || undefined,
                    dtstart,
                    dtend,
                    status: value.status,
                    rrule,
                });
            }
        },
    });

    // Re-initialize forms when occurrence changes
    useEffect(() => {
        occurrenceForm.reset(occurrenceInitialValues(occurrence, tz));
        seriesForm.reset(seriesInitialValues(occurrence, tz));
        setEditTab(initialTab ?? "occurrence");
    }, [occurrence, initialTab, tz, occurrenceForm.reset, seriesForm.reset]);

    // When switching to "Whole Series" mode, reset seriesFirstDate to the actual series
    // start date (not the clicked occurrence's date). When switching to "From Here",
    // reset to the occurrence date.
    useEffect(() => {
        if (editTab === "whole" && eventData) {
            seriesForm.setFieldValue(
                "seriesFirstDate",
                toLocalDateString(eventData.dtstart, tz),
            );
            if (eventData.recurrenceEndDate) {
                seriesForm.setFieldValue(
                    "seriesLastDate",
                    toLocalDateString(eventData.recurrenceEndDate, tz),
                );
                seriesForm.setFieldValue("seriesHasEndDate", true);
            } else {
                seriesForm.setFieldValue("seriesLastDate", "");
                seriesForm.setFieldValue("seriesHasEndDate", false);
            }
        } else if (editTab === "fromHere") {
            seriesForm.setFieldValue(
                "seriesFirstDate",
                occurrence.occurrenceDate,
            );
            seriesForm.setFieldValue("seriesLastDate", "");
            seriesForm.setFieldValue("seriesHasEndDate", false);
        }
    }, [
        editTab,
        eventData,
        tz,
        occurrence.occurrenceDate,
        seriesForm.setFieldValue,
    ]);

    const handleCancel = () => {
        if (editTab === "occurrence") {
            upsertOverride.mutate({
                eventId: occurrence.eventId,
                occurrenceDate: occurrence.occurrenceDate,
                status: "cancelled",
            });
        } else {
            updateEvent.mutate({
                id: occurrence.eventId,
                status: "cancelled",
            });
        }
    };

    const handleDelete = () => {
        if (editTab === "occurrence") {
            if (
                !confirm(
                    "Delete this occurrence? It can be re-included from the series tab.",
                )
            )
                return;
            deleteOccurrence.mutate({
                eventId: occurrence.eventId,
                occurrenceDate: occurrence.occurrenceDate,
            });
        } else {
            if (
                !confirm(
                    "Delete this entire recurring event series? This cannot be undone.",
                )
            )
                return;
            deleteEvent.mutate({ id: occurrence.eventId });
        }
    };

    const seriesIsPending =
        updateEvent.isPending || editSeriesFromDate.isPending;

    return (
        <Tabs onValueChange={(v) => setEditTab(v as EditTab)} value={editTab}>
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="occurrence">This Occurrence</TabsTrigger>
                <TabsTrigger value="fromHere">From Here</TabsTrigger>
                <TabsTrigger value="whole">Whole Series</TabsTrigger>
            </TabsList>

            {/* Occurrence Tab */}
            <TabsContent className="space-y-4 pt-4" value="occurrence">
                <occurrenceForm.AppForm>
                    <occurrenceForm.Form className="space-y-4">
                        <p className="text-muted-foreground text-sm">
                            Changes only affect this specific occurrence. Leave
                            fields empty to inherit from series.
                        </p>

                        <EventBasicsGroup
                            fields={eventBasicsFields}
                            form={occurrenceForm}
                            inheritPlaceholders
                            titlePlaceholder={occurrence.summary}
                        />

                        <occurrenceForm.AppField name="notes">
                            {(field) => (
                                <field.TextareaField
                                    label="Notes"
                                    placeholder="e.g., Moved due to holiday"
                                    rows={2}
                                />
                            )}
                        </occurrenceForm.AppField>

                        <EventTimeGroup
                            endHint="Inherited from series"
                            fields={eventTimeFields}
                            form={occurrenceForm}
                            idPrefix="edit-occurrence"
                        />

                        <occurrenceForm.AppField name="status">
                            {(field) => (
                                <field.SelectField
                                    label="Status"
                                    options={STATUS_OPTIONS}
                                />
                            )}
                        </occurrenceForm.AppField>

                        <EditActions
                            canCancel={occurrence.status !== "cancelled"}
                            cancelLabel="Cancel Occurrence"
                            deleteLabel="Delete Occurrence"
                            deletePending={deleteOccurrence.isPending}
                            onCancel={handleCancel}
                            onClose={onClose}
                            onDelete={handleDelete}
                            pending={upsertOverride.isPending}
                        >
                            <occurrenceForm.SubmitButton
                                disabled={upsertOverride.isPending || undefined}
                            >
                                {({ isSubmitting }) =>
                                    isSubmitting || upsertOverride.isPending
                                        ? "Saving..."
                                        : "Save Override"
                                }
                            </occurrenceForm.SubmitButton>
                        </EditActions>
                    </occurrenceForm.Form>
                </occurrenceForm.AppForm>
            </TabsContent>

            {/* Series form: rendered once, shown for both "From Here" and "Whole Series" */}
            {(editTab === "fromHere" || editTab === "whole") && (
                <div className="space-y-4 pt-4">
                    <seriesForm.AppForm>
                        <seriesForm.Form className="space-y-4">
                            <p className="text-muted-foreground text-sm">
                                {editTab === "fromHere"
                                    ? "Changes apply from this occurrence onwards. The series will be split; past occurrences remain unchanged."
                                    : "Changes apply to the entire series, including all past and future occurrences."}
                            </p>

                            <EventBasicsGroup
                                fields={eventBasicsFields}
                                form={seriesForm}
                                titleRequired
                            />

                            <SeriesScheduleGroup
                                endHint={openEndHint(occurrence.eventType)}
                                fields={seriesScheduleFields}
                                firstDateDescription={
                                    editTab === "fromHere"
                                        ? "New series starts from this date"
                                        : "Change to adjust when series starts"
                                }
                                firstDateDisabled={editTab === "fromHere"}
                                form={seriesForm}
                                idPrefix="edit-series"
                            />

                            {seriesForm.state.values.recurrenceConfig && (
                                <seriesForm.AppField name="recurrenceConfig">
                                    {(field) => (
                                        <field.RecurrencePickerField
                                            startDate={occurrence.dtstart}
                                        />
                                    )}
                                </seriesForm.AppField>
                            )}

                            <EventStatusGroup
                                fields={eventStatusFields}
                                form={seriesForm}
                            />

                            <EditActions
                                canCancel={occurrence.status !== "cancelled"}
                                cancelLabel="Cancel Series"
                                deleteLabel="Delete Series"
                                deletePending={deleteEvent.isPending}
                                onCancel={handleCancel}
                                onClose={onClose}
                                onDelete={handleDelete}
                                pending={seriesIsPending}
                            >
                                <seriesForm.SubmitButton
                                    disabled={seriesIsPending || undefined}
                                >
                                    {({ isSubmitting }) =>
                                        isSubmitting || seriesIsPending
                                            ? "Saving..."
                                            : editTab === "whole"
                                              ? "Update Series"
                                              : "Split & Update"
                                    }
                                </seriesForm.SubmitButton>
                            </EditActions>
                        </seriesForm.Form>
                    </seriesForm.AppForm>
                </div>
            )}
        </Tabs>
    );
}
