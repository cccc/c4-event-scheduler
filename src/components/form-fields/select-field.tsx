import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useFieldContext } from "@/hooks/form";

type SelectFieldProps = {
    label: string;
    options: {
        value: string;
        label: string | React.ReactNode;
        disabled?: boolean;
    }[];
    placeholder?: string;
    /** Helper text under the select */
    description?: string;
};

export function SelectField({
    label,
    options,
    placeholder,
    description,
}: SelectFieldProps) {
    const field = useFieldContext<string>();
    return (
        <div>
            <Label>{label}</Label>
            <Select
                onValueChange={field.handleChange}
                value={field.state.value}
            >
                <SelectTrigger>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((opt) => (
                        <SelectItem
                            disabled={opt.disabled}
                            key={opt.value}
                            value={opt.value}
                        >
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {description && (
                <p className="mt-1 text-muted-foreground text-xs">
                    {description}
                </p>
            )}
        </div>
    );
}
