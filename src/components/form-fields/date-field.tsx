import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

type DateFieldProps = {
	label: string;
	required?: boolean;
	disabled?: boolean;
	description?: string;
};

export function DateField({
	label,
	required,
	disabled,
	description,
}: DateFieldProps) {
	const field = useFieldContext<string>();
	return (
		<div>
			<Label>
				{label}
				{required && <span className="text-destructive"> *</span>}
			</Label>
			<Input
				disabled={disabled}
				onChange={(e) => field.handleChange(e.target.value)}
				type="date"
				value={field.state.value}
			/>
			{description && (
				<p className="mt-1 text-muted-foreground text-xs">{description}</p>
			)}
		</div>
	);
}
