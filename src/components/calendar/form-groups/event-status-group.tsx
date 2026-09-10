import { withFieldGroup } from "@/hooks/form";

export const STATUS_OPTIONS = [
    { value: "confirmed", label: "Confirmed" },
    { value: "tentative", label: "Tentative" },
    { value: "cancelled", label: "Cancelled" },
];

export const DRAFT_NOTE =
    "This event is a draft. Drafts never appear in iCal feeds and are hidden from unauthenticated users.";

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
                        <div>
                            <field.CheckboxField id="isDraft" label="Draft" />
                            {field.state.value && (
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {DRAFT_NOTE}
                                </p>
                            )}
                        </div>
                    )}
                </group.AppField>
            </>
        );
    },
});
