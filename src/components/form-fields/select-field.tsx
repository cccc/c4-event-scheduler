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
	options: { value: string; label: string | React.ReactNode }[];
	placeholder?: string;
};

export function SelectField({ label, options, placeholder }: SelectFieldProps) {
	const field = useFieldContext<string>();
	return (
		<div>
			<Label>{label}</Label>
			<Select onValueChange={field.handleChange} value={field.state.value}>
				<SelectTrigger>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
