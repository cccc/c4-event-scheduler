import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

type DateTimeFieldProps = {
    /** Omit when a wrapping component renders the label */
    label?: string;
    required?: boolean;
};

export function DateTimeField({ label, required }: DateTimeFieldProps) {
    const field = useFieldContext<string>();
    return (
        <div>
            {label && (
                <Label>
                    {label}
                    {required && <span className="text-destructive"> *</span>}
                </Label>
            )}
            <Input
                onChange={(e) => field.handleChange(e.target.value)}
                type="datetime-local"
                value={field.state.value}
            />
        </div>
    );
}
