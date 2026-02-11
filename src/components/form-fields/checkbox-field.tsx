import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";

type CheckboxFieldProps = {
	label: string;
	id: string;
};

export function CheckboxField({ label, id }: CheckboxFieldProps) {
	const field = useFieldContext<boolean>();
	return (
		<div className="flex items-center space-x-2">
			<Checkbox
				checked={field.state.value}
				id={id}
				onCheckedChange={(checked) => field.handleChange(!!checked)}
			/>
			<Label className="font-normal" htmlFor={id}>
				{label}
			</Label>
		</div>
	);
}
