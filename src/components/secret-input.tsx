import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

// A dot per hidden character; `prefix` stays readable when the value has it
function mask(value: string, prefix: string | undefined): string {
    const shown = prefix && value.startsWith(prefix) ? prefix : "";
    return `${shown}${"•".repeat(value.length - shown.length)}`;
}

type SecretInputProps = {
    /** undefined while loading (shows a placeholder, buttons disabled) */
    value: string | undefined;
    /** Accessible name, e.g. "Feed token" */
    label: string;
    /** Non-secret start of the value that stays visible when masked */
    prefix?: string;
    className?: string;
};

/**
 * A read-only secret with show/hide and copy buttons inside the field. The
 * value is masked until revealed, so it does not end up in a screen share
 * or screenshot by accident; Copy works either way. A new value (e.g. after
 * regenerating) starts masked again.
 */
export function SecretInput({
    value,
    label,
    prefix,
    className,
}: SecretInputProps) {
    const [revealed, setRevealed] = useState(false);
    const [shownValue, setShownValue] = useState(value);
    if (value !== shownValue) {
        setShownValue(value);
        setRevealed(false);
    }

    const copy = async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
    };

    return (
        <InputGroup className={cn("min-w-64", className)}>
            <InputGroupInput
                aria-label={label}
                className="font-mono"
                readOnly
                value={!value ? "…" : revealed ? value : mask(value, prefix)}
            />
            <InputGroupAddon align="inline-end">
                <InputGroupButton
                    aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
                    aria-pressed={revealed}
                    disabled={!value}
                    onClick={() => setRevealed((r) => !r)}
                    size="icon-xs"
                    title={revealed ? "Hide" : "Show"}
                >
                    {revealed ? <EyeOff /> : <Eye />}
                </InputGroupButton>
                <InputGroupButton disabled={!value} onClick={copy}>
                    <Copy />
                    Copy
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );
}
