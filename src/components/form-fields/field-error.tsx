import { useFieldContext } from "@/hooks/form";
import { cn } from "@/lib/utils";

type FieldErrorProps = {
	component?: React.ElementType;
	className?: string;
};

export function FieldError({
	component: Component = "p",
	className,
}: FieldErrorProps) {
	const field = useFieldContext();
	const errors = field.state.meta.errors;
	if (!errors.length) return null;

	return (
		<Component className={cn("mt-1 text-destructive text-sm", className)}>
			{errors
				.map((error) => (typeof error === "string" ? error : error?.message))
				.join(", ")}
		</Component>
	);
}
