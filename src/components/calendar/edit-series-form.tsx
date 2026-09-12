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
import { eventTypesQueries } from "@/lib/queries/event-types";
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
    EventTypeGroup,
    eventTypeFields,
} from "./form-groups/event-type-group";
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
    eventTypeId: z.string().min(1, "Event type is required"),
    ...eventBasicsShape,
    ...eventStatusShape,
    ...seriesScheduleShape,
    recurrenceConfig: z.custom<RecurrenceConfig>().nullable(),
    frequencyLabel: z.string().max(255),
});

type EditTab = "occurrence" | "fromHere" | "whole";

// Override form: only fields the override itself sets are filled in,
// empty fields inherit from the series. Times count as the override's own
// only when they differ from what the series gives this occurrence.
function occurrenceInitialValues(
    occurrence: Occurrence,
    tz: string,
    series: { startMs: number; endMs: number | null },
): z.infer<typeof occurrenceFormSchema> {
    const own = occurrence.isOverridden;
    const ownStart = own && occurrence.dtstart.getTime() !== series.startMs;
    const ownEnd =
        own && (occurrence.dtend?.getTime() ?? null) !== series.endMs;
    return {
        summary: own ? occurrence.summary : "",
        description: own ? (occurrence.description ?? "") : "",
        url: own ? (occurrence.url ?? "") : "",
        location: own ? (occurrence.location ?? "") : "",
        notes: occurrence.notes ?? "",
        status: occurrence.status,
        dtstart: ownStart ? toLocalDateTimeString(occurrence.dtstart, tz) : "",
        dtend: toLocalDateTimeString(
            occurrence.dtend ?? oneHourLater(occurrence.dtstart),
            tz,
        ),
        hasEndTime: ownEnd,
    };
}

function seriesInitialValues(
    occurrence: Occurrence,
    tz: string,
): z.infer<typeof seriesFormSchema> {
    return {
        eventTypeId: occurrence.eventType?.id ?? "",
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
        // Occurrences do not carry the label; filled in once the series loads
        frequencyLabel: "",
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

    // What this occurrence inherits from the series, shown as placeholders
    // in the override form. eventData holds the series' own values; the
    // occurrence's values may already be overridden.
    const series = eventData ?? occurrence;
    const inherit = "Leave empty to inherit from series";
    const seriesPlaceholders = {
        summary: series.summary,
        description: series.description ?? inherit,
        url: series.url ?? inherit,
        location: series.location ?? inherit,
    };
    const seriesStart = eventData
        ? combineDateAndTime(
              occurrence.occurrenceDate,
              toLocalTimeString(eventData.dtstart, tz),
              tz,
          )
        : occurrence.dtstart;
    const seriesEnd = eventData
        ? eventData.dtend
            ? new Date(
                  seriesStart.getTime() +
                      (eventData.dtend.getTime() - eventData.dtstart.getTime()),
              )
            : null
        : occurrence.dtend;
    const inheritedStart = toLocalDateTimeString(seriesStart, tz);
    const inheritedEndHint = seriesEnd
        ? `Inherited from series (${toLocalTimeString(seriesEnd, tz)})`
        : "Inherited from series (open end)";
    const seriesTimes = {
        startMs: seriesStart.getTime(),
        endMs: seriesEnd?.getTime() ?? null,
    };

    // Types usable in this space: global ones plus the space's own
    const { data: eventTypes = [] } = useQuery(
        eventTypesQueries.list({ spaceId: occurrence.space.id }),
    );

    const updateEvent = useEventMutation(updateEventFn, onClose);
    const upsertOverride = useEventMutation(upsertOverrideFn, onClose);
    const deleteOccurrence = useEventMutation(deleteOccurrenceFn, onClose);
    const editSeriesFromDate = useEventMutation(editSeriesFromDateFn, onClose);
    const deleteEvent = useEventMutation(deleteEventFn, onClose);

    const occurrenceForm = useAppForm({
        defaultValues: occurrenceInitialValues(occurrence, tz, seriesTimes),
        validators: {
            onSubmit: occurrenceFormSchema,
        },
        onSubmit: async ({ value }) => {
            const dtstart = value.dtstart
                ? parseLocalDateTime(value.dtstart, tz)
                : null;
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
                    dtstart &&
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
                    eventTypeId: value.eventTypeId,
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
                    frequencyLabel: value.frequencyLabel || null,
                });
            } else {
                editSeriesFromDate.mutate({
                    eventId: occurrence.eventId,
                    splitDate: occurrence.dtstart,
                    eventTypeId: value.eventTypeId,
                    summary: value.summary,
                    description: value.description || undefined,
                    url: value.url || undefined,
                    location: value.location || undefined,
                    dtstart,
                    dtend,
                    status: value.status,
                    isDraft: value.isDraft,
                    rrule,
                    frequencyLabel: value.frequencyLabel || null,
                });
            }
        },
    });

    // Re-initialize forms when the occurrence changes (the override form
    // also once the series data has loaded, since that decides which times
    // count as overridden)
    useEffect(() => {
        occurrenceForm.reset(
            occurrenceInitialValues(occurrence, tz, {
                startMs: seriesTimes.startMs,
                endMs: seriesTimes.endMs,
            }),
        );
    }, [
        occurrence,
        tz,
        seriesTimes.startMs,
        seriesTimes.endMs,
        occurrenceForm.reset,
    ]);

    useEffect(() => {
        seriesForm.reset(seriesInitialValues(occurrence, tz));
        setEditTab(initialTab ?? "occurrence");
    }, [occurrence, initialTab, tz, seriesForm.reset]);

    // The display label only exists on the series record
    const seriesLabel = eventData?.frequencyLabel;
    useEffect(() => {
        if (seriesLabel !== undefined) {
            seriesForm.setFieldValue("frequencyLabel", seriesLabel ?? "");
        }
    }, [seriesLabel, seriesForm.setFieldValue]);

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
                            placeholders={seriesPlaceholders}
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
                            endHint={inheritedEndHint}
                            fields={eventTimeFields}
                            form={occurrenceForm}
                            idPrefix="edit-occurrence"
                            startPlaceholder={inheritedStart}
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

                            <EventTypeGroup
                                eventTypes={eventTypes}
                                fields={eventTypeFields}
                                form={seriesForm}
                            />

                            <EventBasicsGroup
                                fields={eventBasicsFields}
                                form={seriesForm}
                                titleRequired
                            />

                            <seriesForm.Subscribe
                                selector={(state) => state.values.eventTypeId}
                            >
                                {(eventTypeId) => (
                                    <SeriesScheduleGroup
                                        endHint={openEndHint(
                                            eventTypes.find(
                                                (et) => et.id === eventTypeId,
                                            ) ?? occurrence.eventType,
                                        )}
                                        fields={seriesScheduleFields}
                                        firstDateDescription={
                                            editTab === "fromHere"
                                                ? "New series starts from this date"
                                                : "Change to adjust when series starts"
                                        }
                                        firstDateDisabled={
                                            editTab === "fromHere"
                                        }
                                        form={seriesForm}
                                        idPrefix="edit-series"
                                    />
                                )}
                            </seriesForm.Subscribe>

                            {seriesForm.state.values.recurrenceConfig && (
                                <seriesForm.AppField name="recurrenceConfig">
                                    {(field) => (
                                        <field.RecurrencePickerField
                                            startDate={occurrence.dtstart}
                                        >
                                            <seriesForm.AppField name="frequencyLabel">
                                                {(labelField) => (
                                                    <labelField.TextField
                                                        description="Human-readable version of the rule, shown on the website"
                                                        label="Display Label"
                                                        placeholder="e.g., Jeden Donnerstag (~19 Uhr)"
                                                    />
                                                )}
                                            </seriesForm.AppField>
                                        </field.RecurrencePickerField>
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
                                <seriesForm.Subscribe
                                    selector={(state) => state.values.isDraft}
                                >
                                    {(isDraft) => (
                                        <seriesForm.SubmitButton
                                            disabled={
                                                seriesIsPending || undefined
                                            }
                                        >
                                            {({ isSubmitting }) =>
                                                isSubmitting || seriesIsPending
                                                    ? "Saving..."
                                                    : editTab !== "whole"
                                                      ? isDraft
                                                          ? "Split & Update Draft"
                                                          : "Split & Update"
                                                      : isDraft
                                                        ? "Update Draft Series"
                                                        : "Update Series"
                                            }
                                        </seriesForm.SubmitButton>
                                    )}
                                </seriesForm.Subscribe>
                            </EditActions>
                        </seriesForm.Form>
                    </seriesForm.AppForm>
                </div>
            )}
        </Tabs>
    );
}
