import { withFieldGroup } from "@/hooks/form";

import type { EventType } from "../types";

export const eventTypeFields = { eventTypeId: "eventTypeId" } as const;

/** Event type select with the type's colour swatch. */
export const EventTypeGroup = withFieldGroup({
    defaultValues: { eventTypeId: "" },
    props: { eventTypes: [] as EventType[] },
    render: function Render({ group, eventTypes }) {
        const options = eventTypes.map((et) => ({
            value: et.id,
            label: (
                <span className="flex items-center gap-2">
                    {et.color && (
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: et.color }}
                        />
                    )}
                    {et.name}
                </span>
            ),
        }));
        return (
            <group.AppField name="eventTypeId">
                {(field) => (
                    <>
                        <field.SelectField
                            label="Event Type"
                            options={options}
                            placeholder="Select an event type"
                        />
                        <field.FieldError />
                    </>
                )}
            </group.AppField>
        );
    },
});
