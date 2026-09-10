import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

import { DateTextInput } from "./date-text-input";

type DateFieldProps = {
    /** Omit when a wrapping component renders the label */
    label?: string;
    required?: boolean;
    disabled?: boolean;
    description?: string;
    /** Shown while empty, in the value format ("yyyy-MM-dd") */
    placeholder?: string;
};

export function DateField({
    label,
    required,
    disabled,
    description,
    placeholder,
}: DateFieldProps) {
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
                disabled={disabled}
                mode="date"
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
