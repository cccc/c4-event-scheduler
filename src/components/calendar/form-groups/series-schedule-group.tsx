import { withFieldGroup } from "@/hooks/form";

import { OptionalEndField } from "../optional-end-field";

type SeriesScheduleProps = {
    /** Makes checkbox ids unique when several forms are mounted */
    idPrefix: string;
    /** Shown in place of the end time input while "no end time" */
    endHint: string;
    firstDateRequired?: boolean;
    firstDateDisabled?: boolean;
    firstDateDescription?: string;
};

export const seriesScheduleFields = {
    seriesFirstDate: "seriesFirstDate",
    seriesLastDate: "seriesLastDate",
    seriesHasEndDate: "seriesHasEndDate",
    occurrenceStartTime: "occurrenceStartTime",
    occurrenceEndTime: "occurrenceEndTime",
    hasEndTime: "hasEndTime",
} as const;

/** Series date range (first/last occurrence) and per-occurrence times. */
export const SeriesScheduleGroup = withFieldGroup({
    defaultValues: {
        seriesFirstDate: "",
        seriesLastDate: "",
        seriesHasEndDate: false,
        occurrenceStartTime: "",
        occurrenceEndTime: "",
        hasEndTime: true,
    },
    props: { idPrefix: "", endHint: "" } as SeriesScheduleProps,
    render: function Render({
        group,
        idPrefix,
        endHint,
        firstDateRequired,
        firstDateDisabled,
        firstDateDescription,
    }) {
        return (
            <>
                <div className="space-y-4 rounded-md border p-4">
                    <h4 className="font-medium text-sm">Series Date Range</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <group.AppField name="seriesFirstDate">
                            {(field) => (
                                <>
                                    <field.DateField
                                        description={firstDateDescription}
                                        disabled={firstDateDisabled}
                                        label="First Occurrence"
                                        required={firstDateRequired}
                                    />
                                    <field.FieldError />
                                </>
                            )}
                        </group.AppField>

                        <group.AppField name="seriesHasEndDate">
                            {(field) => (
                                <OptionalEndField
                                    checked={field.state.value}
                                    hint="No end date; repeats indefinitely"
                                    id={`${idPrefix}-seriesHasEndDate`}
                                    label="Last Occurrence"
                                    onCheckedChange={field.handleChange}
                                >
                                    <group.AppField name="seriesLastDate">
                                        {(lastField) => <lastField.DateField />}
                                    </group.AppField>
                                </OptionalEndField>
                            )}
                        </group.AppField>
                    </div>
                </div>

                <div className="space-y-4 rounded-md border p-4">
                    <h4 className="font-medium text-sm">Occurrence Times</h4>
                    <p className="text-muted-foreground text-xs">
                        Each occurrence will use these times
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <group.AppField name="occurrenceStartTime">
                            {(field) => (
                                <>
                                    <field.TimeField
                                        label="Start Time"
                                        required
                                    />
                                    <field.FieldError />
                                </>
                            )}
                        </group.AppField>

                        <group.AppField name="hasEndTime">
                            {(field) => (
                                <OptionalEndField
                                    checked={field.state.value}
                                    hint={endHint}
                                    id={`${idPrefix}-hasEndTime`}
                                    label="End Time"
                                    onCheckedChange={field.handleChange}
                                >
                                    <group.AppField name="occurrenceEndTime">
                                        {(endField) => <endField.TimeField />}
                                    </group.AppField>
                                </OptionalEndField>
                            )}
                        </group.AppField>
                    </div>
                </div>
            </>
        );
    },
});
