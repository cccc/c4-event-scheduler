import { withFieldGroup } from "@/hooks/form";

type EventBasicsProps = {
    titleRequired?: boolean;
    urlLabel?: string;
    /**
     * Per-field placeholders; occurrence overrides pass the series values
     * so an empty field visibly inherits them.
     */
    placeholders?: {
        summary?: string;
        description?: string;
        url?: string;
        location?: string;
    };
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
    render: function Render({ group, titleRequired, urlLabel, placeholders }) {
        return (
            <>
                <group.AppField name="summary">
                    {(field) => (
                        <>
                            <field.TextField
                                label="Title"
                                placeholder={placeholders?.summary}
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
                            placeholder={placeholders?.description}
                            rows={2}
                        />
                    )}
                </group.AppField>

                <group.AppField name="url">
                    {(field) => (
                        <>
                            <field.TextField
                                label={urlLabel ?? "URL"}
                                placeholder={placeholders?.url ?? "https://..."}
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
                                placeholders?.location ??
                                "Leave empty to use space name"
                            }
                        />
                    )}
                </group.AppField>
            </>
        );
    },
});
