import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

import { DateTextInput } from "./date-text-input";

type TimeFieldProps = {
    /** Omit when a wrapping component renders the label */
    label?: string;
    required?: boolean;
    /** Shown while empty, in the value format ("HH:mm") */
    placeholder?: string;
};

export function TimeField({ label, required, placeholder }: TimeFieldProps) {
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
                mode="time"
                onChange={field.handleChange}
                placeholder={placeholder}
                value={field.state.value}
            />
        </div>
    );
}
