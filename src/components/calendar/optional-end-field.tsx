import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { formatDurationMinutes } from "./date-utils";

type OptionalEndFieldProps = {
    id: string;
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    /** Shown in place of the input while unchecked */
    hint: string;
    /** The input field (rendered without its own label) while checked */
    children: ReactNode;
};

/**
 * A field whose value is optional: the checkbox sits in the label row and
 * toggles between the input and a same-height hint, so the layout does not
 * jump and the field lines up with its neighbours in a grid.
 */
export function OptionalEndField({
    id,
    label,
    checked,
    onCheckedChange,
    hint,
    children,
}: OptionalEndFieldProps) {
    return (
        <div>
            <div className="flex h-3.5 items-center gap-2">
                <Checkbox
                    checked={checked}
                    id={id}
                    onCheckedChange={(value) => onCheckedChange(value === true)}
                />
                <Label htmlFor={id}>{label}</Label>
            </div>
            {checked ? (
                children
            ) : (
                <div
                    className="flex h-9 items-center rounded-md border border-dashed px-3 text-muted-foreground text-sm"
                    title={hint}
                >
                    <span className="truncate">{hint}</span>
                </div>
            )}
        </div>
    );
}

/** Hint for an event without an explicit end time. */
export function openEndHint(
    eventType: { defaultDurationMinutes: number | null } | null | undefined,
): string {
    if (!eventType) return "Open end (default set by event type)";
    if (eventType.defaultDurationMinutes) {
        return `Open end (shown as ${formatDurationMinutes(eventType.defaultDurationMinutes)} by default)`;
    }
    return "Open end (no default duration)";
}
