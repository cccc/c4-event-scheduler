// Source: FullCalendar shadcn registry, item classic-event-calendar
// (https://shadcn-registry.fullcalendar.io/classic-event-calendar.json),
// copied 2026-09-15 for @fullcalendar/react 7.1.0. Import paths point at
// this project's folders; Biome formats the file (its sorting assists are
// off here so the structure stays diffable against upstream).
// No local changes.
/* biome-ignore-all assist/source/useSortedAttributes: keep upstream order */
/* biome-ignore-all lint/nursery/useSortedClasses: keep upstream order */
import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function EventCalendarPrevIcon() {
    return <ChevronLeftIcon className="[[dir=rtl]_&]:rotate-180" />;
}

export function EventCalendarNextIcon() {
    return <ChevronRightIcon className="[[dir=rtl]_&]:rotate-180" />;
}

const hoverIconClassName =
    "text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground";

export function EventCalendarCloseIcon() {
    return <XIcon className={cn("size-5", hoverIconClassName)} />;
}

export function EventCalendarExpanderIcon(props: { isExpanded: boolean }) {
    return (
        <ChevronDownIcon
            className={cn(
                "size-4 m-px",
                hoverIconClassName,
                !props.isExpanded && "-rotate-90 [[dir=rtl]_&]:rotate-90",
            )}
        />
    );
}
