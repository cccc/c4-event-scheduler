import { useStore } from "@tanstack/react-form";

import { Button } from "@/components/ui/button";
import { useFormContext } from "@/hooks/form";

type FormSubmitButtonState = {
	isSubmitting: boolean;
	canSubmit: boolean;
};

type FormSubmitButtonProps = Omit<
	React.ComponentProps<typeof Button>,
	"children"
> & {
	children?:
		| React.ComponentProps<typeof Button>["children"]
		| ((state: FormSubmitButtonState) => React.ReactNode);
};

export function FormSubmitButton({
	children,
	disabled,
	...props
}: FormSubmitButtonProps) {
	const form = useFormContext();
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const canSubmit = useStore(form.store, (state) => state.canSubmit);

	return (
		<Button
			disabled={disabled ?? (!canSubmit || isSubmitting)}
			type="submit"
			{...props}
		>
			{typeof children === "function"
				? children({ isSubmitting, canSubmit })
				: children}
		</Button>
	);
}
