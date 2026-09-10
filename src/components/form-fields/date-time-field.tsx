import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

import { DateTextInput } from "./date-text-input";

type DateTimeFieldProps = {
    /** Omit when a wrapping component renders the label */
    label?: string;
    required?: boolean;
    description?: string;
    /** Shown while empty, in the value format ("yyyy-MM-ddTHH:mm") */
    placeholder?: string;
};

export function DateTimeField({
    label,
    required,
    description,
    placeholder,
}: DateTimeFieldProps) {
    const field = useFieldContext<string>();
    return (
        <div>
            {label && (
                <Label>
                    {label}
                    {required && <span className="text-destructive"> *</span>}
                </Label>
            )}
            <DateTextInput
                mode="datetime"
                onChange={field.handleChange}
                placeholder={placeholder}
                value={field.state.value}
            />
            {description && (
                <p className="mt-1 text-muted-foreground text-xs">
                    {description}
                </p>
            )}
        </div>
    );
}
