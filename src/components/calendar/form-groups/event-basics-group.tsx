import { withFieldGroup } from "@/hooks/form";

type EventBasicsProps = {
    titleRequired?: boolean;
    titlePlaceholder?: string;
    urlLabel?: string;
    /** Occurrence overrides: empty fields inherit from the series */
    inheritPlaceholders?: boolean;
};

// Group field -> form field mapping (module-level: withFieldGroup memoizes
// on the object's identity)
export const eventBasicsFields = {
    summary: "summary",
    description: "description",
    url: "url",
    location: "location",
} as const;

/** Title, description, URL and location. */
export const EventBasicsGroup = withFieldGroup({
    defaultValues: { summary: "", description: "", url: "", location: "" },
    props: {} as EventBasicsProps,
    render: function Render({
        group,
        titleRequired,
        titlePlaceholder,
        urlLabel,
        inheritPlaceholders,
    }) {
        const inherit = inheritPlaceholders
            ? "Leave empty to inherit from series"
            : undefined;
        return (
            <>
                <group.AppField name="summary">
                    {(field) => (
                        <>
                            <field.TextField
                                label="Title"
                                placeholder={titlePlaceholder}
                                required={titleRequired}
                            />
                            <field.FieldError />
                        </>
                    )}
                </group.AppField>

                <group.AppField name="description">
                    {(field) => (
                        <field.TextareaField
                            label="Description"
                            placeholder={inherit}
                            rows={2}
                        />
                    )}
                </group.AppField>

                <group.AppField name="url">
                    {(field) => (
                        <>
                            <field.TextField
                                label={urlLabel ?? "URL"}
                                placeholder="https://..."
                                type="url"
                            />
                            <field.FieldError />
                        </>
                    )}
                </group.AppField>

                <group.AppField name="location">
                    {(field) => (
                        <field.TextField
                            label="Location"
                            placeholder={
                                inherit ?? "Leave empty to use space name"
                            }
                        />
                    )}
                </group.AppField>
            </>
        );
    },
});
