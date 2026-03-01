import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

type TimeFieldProps = {
    label: string;
    required?: boolean;
};

export function TimeField({ label, required }: TimeFieldProps) {
    const field = useFieldContext<string>();
    return (
        <div>
            <Label>
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            <Input
                onChange={(e) => field.handleChange(e.target.value)}
                type="time"
                value={field.state.value}
            />
        </div>
    );
}
