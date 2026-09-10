import { withFieldGroup } from "@/hooks/form";

export const STATUS_OPTIONS = [
    { value: "confirmed", label: "Confirmed" },
    { value: "tentative", label: "Tentative" },
    { value: "cancelled", label: "Cancelled" },
];

export const eventStatusFields = {
    status: "status",
    isDraft: "isDraft",
} as const;

/** iCal status plus the draft flag. */
export const EventStatusGroup = withFieldGroup({
    defaultValues: {
        status: "confirmed" as "confirmed" | "tentative" | "cancelled",
        isDraft: false,
    },
    render: function Render({ group }) {
        return (
            <>
                <group.AppField name="status">
                    {(field) => (
                        <field.SelectField
                            label="Status"
                            options={STATUS_OPTIONS}
                        />
                    )}
                </group.AppField>

                <group.AppField name="isDraft">
                    {(field) => (
                        <field.CheckboxField
                            id="isDraft"
                            label="Draft (hidden from public feeds)"
                        />
                    )}
                </group.AppField>
            </>
        );
    },
});
