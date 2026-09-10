import { format, isValid, parse } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export type DateTextMode = "datetime" | "date" | "time";

// Form values keep the formats of the former native inputs; the visible
// text uses day-first order and gets a real placeholder.
const FORMATS: Record<
    DateTextMode,
    { value: string; display: string; hint: string }
> = {
    datetime: {
        value: "yyyy-MM-dd'T'HH:mm",
        display: "dd.MM.yyyy HH:mm",
        hint: "dd.mm.yyyy hh:mm",
    },
    date: { value: "yyyy-MM-dd", display: "dd.MM.yyyy", hint: "dd.mm.yyyy" },
    time: { value: "HH:mm", display: "HH:mm", hint: "hh:mm" },
};

function parseWith(text: string, pattern: string): Date | null {
    if (!text.trim()) return null;
    const date = parse(text.trim(), pattern, new Date());
    return isValid(date) ? date : null;
}

type DateTextInputProps = {
    mode: DateTextMode;
    /** Form value in the mode's value format ("" = empty) */
    value: string;
    onChange: (value: string) => void;
    /** Placeholder in the mode's value format; falls back to a format hint */
    placeholder?: string;
    disabled?: boolean;
    id?: string;
};

/**
 * shadcn "date picker with input": a text input with a placeholder plus a
 * calendar button that fills in the date part. Typing a complete, valid
 * value commits it; an invalid one is flagged and clears the form value.
 */
export function DateTextInput({
    mode,
    value,
    onChange,
    placeholder,
    disabled,
    id,
}: DateTextInputProps) {
    const spec = FORMATS[mode];
    const parsedValue = parseWith(value, spec.value);
    const parsedPlaceholder = placeholder
        ? parseWith(placeholder, spec.value)
        : null;

    const [text, setText] = useState(
        parsedValue ? format(parsedValue, spec.display) : "",
    );
    const [invalid, setInvalid] = useState(false);
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState<Date | undefined>(
        parsedValue ?? parsedPlaceholder ?? undefined,
    );
    // Values this input emitted itself; those must not overwrite the text
    // being typed when they come back as the new form value.
    const emitted = useRef<string | null>(null);

    useEffect(() => {
        if (value === emitted.current) return;
        emitted.current = null;
        const parsed = parseWith(value, spec.value);
        setText(parsed ? format(parsed, spec.display) : "");
        setInvalid(false);
        if (parsed) setMonth(parsed);
    }, [value, spec.value, spec.display]);

    const emit = (next: string) => {
        emitted.current = next;
        onChange(next);
    };

    const handleText = (next: string) => {
        setText(next);
        if (!next.trim()) {
            setInvalid(false);
            emit("");
            return;
        }
        const parsed = parseWith(next, spec.display);
        if (parsed) {
            setInvalid(false);
            setMonth(parsed);
            emit(format(parsed, spec.value));
        } else {
            setInvalid(true);
            emit("");
        }
    };

    const handlePick = (day: Date | undefined) => {
        if (!day) return;
        const next = new Date(day);
        if (mode === "datetime") {
            const base = parsedValue ?? parsedPlaceholder;
            next.setHours(base?.getHours() ?? 0, base?.getMinutes() ?? 0, 0, 0);
        }
        setText(format(next, spec.display));
        setInvalid(false);
        setMonth(next);
        emit(format(next, spec.value));
        setOpen(false);
    };

    return (
        <InputGroup>
            <InputGroupInput
                aria-invalid={invalid || undefined}
                disabled={disabled}
                id={id}
                inputMode="numeric"
                onChange={(e) => handleText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && mode !== "time") {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                placeholder={
                    parsedPlaceholder
                        ? format(parsedPlaceholder, spec.display)
                        : spec.hint
                }
                value={text}
            />
            <InputGroupAddon align="inline-end">
                {mode === "time" ? (
                    <ClockIcon className="text-muted-foreground" />
                ) : (
                    <Popover onOpenChange={setOpen} open={open}>
                        <PopoverTrigger asChild>
                            <InputGroupButton
                                aria-label="Pick a date"
                                disabled={disabled}
                                size="icon-xs"
                                variant="ghost"
                            >
                                <CalendarIcon />
                            </InputGroupButton>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            alignOffset={-8}
                            className="w-auto overflow-hidden p-0"
                            sideOffset={10}
                        >
                            <Calendar
                                captionLayout="dropdown"
                                locale={de}
                                mode="single"
                                month={month}
                                onMonthChange={setMonth}
                                onSelect={handlePick}
                                selected={parsedValue ?? undefined}
                            />
                        </PopoverContent>
                    </Popover>
                )}
            </InputGroupAddon>
        </InputGroup>
    );
}
