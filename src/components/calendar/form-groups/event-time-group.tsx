import { withFieldGroup } from "@/hooks/form";

import { OptionalEndField } from "../optional-end-field";

type EventTimeProps = {
    /** Makes checkbox ids unique when several forms are mounted */
    idPrefix: string;
    /** Shown in place of the end input while "no end time" */
    endHint: string;
    startRequired?: boolean;
};

export const eventTimeFields = {
    dtstart: "dtstart",
    dtend: "dtend",
    hasEndTime: "hasEndTime",
} as const;

/** Start date/time plus optional end date/time, side by side. */
export const EventTimeGroup = withFieldGroup({
    defaultValues: { dtstart: "", dtend: "", hasEndTime: true },
    props: { idPrefix: "", endHint: "" } as EventTimeProps,
    render: function Render({ group, idPrefix, endHint, startRequired }) {
        return (
            <div className="grid grid-cols-2 gap-4">
                <group.AppField name="dtstart">
                    {(field) => (
                        <>
                            <field.DateTimeField
                                label="Start Date & Time"
                                required={startRequired}
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
                            label="End Date & Time"
                            onCheckedChange={field.handleChange}
                        >
                            <group.AppField name="dtend">
                                {(endField) => <endField.DateTimeField />}
                            </group.AppField>
                        </OptionalEndField>
                    )}
                </group.AppField>
            </div>
        );
    },
});
