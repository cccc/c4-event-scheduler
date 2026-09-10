import { Badge } from "@/components/ui/badge";
import { withFieldGroup } from "@/hooks/form";

import type { EventType } from "../types";

export const eventTypeFields = { eventTypeId: "eventTypeId" } as const;

export const INTERNAL_EVENT_TYPE_NOTE =
    "This event type is internal. Events with this event type will not show up in any public feed or to any unauthenticated user.";

export function InternalBadge() {
    return (
        <Badge className="ml-1" variant="outline">
            Internal
        </Badge>
    );
}

/** Event type select with the type's colour swatch and internal marker. */
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
                    {et.isInternal && <InternalBadge />}
                </span>
            ),
        }));
        return (
            <group.AppField name="eventTypeId">
                {(field) => {
                    const selected = eventTypes.find(
                        (et) => et.id === field.state.value,
                    );
                    return (
                        <>
                            <field.SelectField
                                label="Event Type"
                                options={options}
                                placeholder="Select an event type"
                            />
                            <field.FieldError />
                            {selected?.isInternal && (
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {INTERNAL_EVENT_TYPE_NOTE}
                                </p>
                            )}
                        </>
                    );
                }}
            </group.AppField>
        );
    },
});
