import { useFormContext } from "@/hooks/form";

type FormProps = Omit<React.ComponentProps<"form">, "onSubmit">;

export function FormForm({ children, ...props }: FormProps) {
    const form = useFormContext();
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
            }}
            {...props}
        >
            {children}
        </form>
    );
}
