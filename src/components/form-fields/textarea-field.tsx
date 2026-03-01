import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFieldContext } from "@/hooks/form";

type TextareaFieldProps = {
    label: string;
    placeholder?: string;
    rows?: number;
};

export function TextareaField({
    label,
    placeholder,
    rows,
}: TextareaFieldProps) {
    const field = useFieldContext<string>();
    return (
        <div>
            <Label>{label}</Label>
            <Textarea
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                value={field.state.value}
            />
        </div>
    );
}
