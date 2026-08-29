import {
    getRecurrenceSummary,
    type RecurrenceConfig,
    RecurrencePicker,
} from "@/components/recurrence-picker";
import { useFieldContext } from "@/hooks/form";

type RecurrencePickerFieldProps = {
    startDate: Date | null;
};

export function RecurrencePickerField({
    startDate,
}: RecurrencePickerFieldProps) {
    const field = useFieldContext<RecurrenceConfig | null>();
    return (
        <div className="rounded-md border p-4">
            <h4 className="mb-4 font-medium text-sm">Recurrence Pattern</h4>
            <RecurrencePicker
                initialConfig={field.state.value ?? undefined}
                onChange={field.handleChange}
                startDate={startDate}
            />
            {field.state.value && (
                <p className="mt-3 border-t pt-3 text-muted-foreground text-sm">
                    {getRecurrenceSummary(field.state.value)}
                </p>
            )}
        </div>
    );
}
