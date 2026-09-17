import { Check, Copy, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const COPIED_FOR_MS = 2000;

/**
 * Copies `value` to the clipboard on `copy()`; `copied` is true for two
 * seconds afterwards, for feedback where the click happened. Nothing is
 * copied while `value` is undefined (still loading).
 */
export function useCopy(value: string | undefined) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
        return () => clearTimeout(timer);
    }, [copied]);
    const copy = async () => {
        if (value === undefined) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
    };
    return { copied, copy };
}

type CopyButtonProps = Omit<
    React.ComponentProps<typeof Button>,
    "onClick" | "children"
> & {
    value: string | undefined;
    /** Button text; "Copied" replaces it after a copy */
    label?: string;
    icon?: LucideIcon;
};

/** A button that copies `value` and confirms on itself */
export function CopyButton({
    value,
    label = "Copy",
    icon: Icon = Copy,
    disabled,
    ...props
}: CopyButtonProps) {
    const { copied, copy } = useCopy(value);
    return (
        <Button
            disabled={disabled || value === undefined}
            onClick={copy}
            type="button"
            {...props}
        >
            {copied ? <Check /> : <Icon />}
            {copied ? "Copied" : label}
        </Button>
    );
}
