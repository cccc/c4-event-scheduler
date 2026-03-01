import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

type TextFieldProps = {
    label: string;
    required?: boolean;
    placeholder?: string;
    type?: string;
    description?: string;
};

export function TextField({
    label,
    required,
    placeholder,
    type,
    description,
}: TextFieldProps) {
    const field = useFieldContext<string>();
    return (
        <div>
            <Label>
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            <Input
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={placeholder}
                type={type}
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
