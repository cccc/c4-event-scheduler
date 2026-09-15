// Source: FullCalendar shadcn registry, item classic-event-calendar
// (https://shadcn-registry.fullcalendar.io/classic-event-calendar.json),
// copied 2026-09-15 for @fullcalendar/react 7.1.0. Import paths point at
// this project's folders; Biome formats the file (its sorting assists are
// off here so the structure stays diffable against upstream).
// Local changes, each marked with a `c4:` comment:
//   - optional `controller` prop (external useCalendarController) for navigation from outside
//   - multi-month plugin and view removed
//   - addButton.click typed as a React MouseEventHandler (drops the `as any` in the toolbar)
//   - `fallbackTitle` and `toolbarLinks` props passed to the toolbar
/* biome-ignore-all assist/source/useSortedAttributes: keep upstream order */
/* biome-ignore-all lint/nursery/useSortedClasses: keep upstream order */
import {
    type CalendarController,
    type CalendarOptions,
    useCalendarController,
} from "@fullcalendar/react"; // c4: CalendarController type
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import type { MouseEventHandler } from "react"; // c4
import { EventCalendarCloseIcon } from "@/components/calendar/event-calendar-icons";
import {
    EventCalendarToolbar,
    type EventCalendarToolbarProps,
} from "@/components/calendar/event-calendar-toolbar";
import { EventCalendarViews } from "@/components/ui/event-calendar-views";
import { cn } from "@/lib/utils";

const plugins = [
    dayGridPlugin,
    timeGridPlugin,
    listPlugin,
    interactionPlugin,
    // c4: multiMonthPlugin dropped, we do not offer that view
];
const defaultAvailableViews = [
    "dayGridMonth",
    "timeGridWeek",
    "timeGridDay",
    "listWeek",
    // c4: 'multiMonthYear' dropped
];
const navLinkDayClick = "timeGridDay";
const navLinkWeekClick = "timeGridWeek";

export interface EventCalendarProps
    extends Omit<
        CalendarOptions,
        "class" | "className" | "headerToolbar" | "footerToolbar"
    > {
    className?: string;
    availableViews?: string[];
    // c4: optional external controller (useCalendarController), so the page
    // can navigate the calendar (deep links); falls back to an internal one
    controller?: CalendarController;
    fallbackTitle?: string; // c4: toolbar title until the calendar has mounted
    toolbarLinks?: EventCalendarToolbarProps["toolbarLinks"]; // c4: link navigation
    addButton?: {
        isPrimary?: boolean;
        text?: string;
        hint?: string;
        click?: MouseEventHandler<HTMLButtonElement>; // c4: React handler type, no cast needed
    };
}

export function EventCalendar({
    availableViews = defaultAvailableViews,
    addButton,
    className,
    controller: userController, // c4
    fallbackTitle, // c4
    toolbarLinks, // c4
    height,
    contentHeight,
    direction,
    plugins: userPlugins = [],
    ...restOptions
}: EventCalendarProps) {
    const ownController = useCalendarController();
    const controller = userController ?? ownController; // c4

    const hasBorderX = !(restOptions.borderlessX ?? restOptions.borderless);
    const hasBorderBottom = !(
        restOptions.borderlessBottom ?? restOptions.borderless
    );
    const isHeightAuto = height === "auto" || contentHeight === "auto";

    return (
        <div
            className={cn(className, "flex flex-col gap-5")}
            style={{ height }}
            dir={direction === "rtl" ? "rtl" : undefined}
        >
            <EventCalendarToolbar
                className={!hasBorderX ? "px-3" : undefined}
                controller={controller}
                availableViews={availableViews}
                fallbackTitle={fallbackTitle} // c4
                toolbarLinks={toolbarLinks} // c4
                addButton={addButton}
            />
            <div className="grow min-h-0">
                <EventCalendarViews
                    className={cn(
                        "bg-background border-t",
                        hasBorderX && "border-x",
                        hasBorderBottom && "border-b",
                        hasBorderX && !isHeightAuto && "rounded-t-xs",
                        hasBorderBottom &&
                            hasBorderX &&
                            !isHeightAuto &&
                            "rounded-b-xs",
                        !isHeightAuto && "overflow-hidden",
                    )}
                    height={
                        isHeightAuto
                            ? "auto"
                            : height !== undefined
                              ? "100%"
                              : contentHeight
                    }
                    initialView={availableViews[0]}
                    navLinkDayClick={navLinkDayClick}
                    navLinkWeekClick={navLinkWeekClick}
                    controller={controller}
                    plugins={[...plugins, ...userPlugins]}
                    popoverCloseContent={() => <EventCalendarCloseIcon />}
                    {...restOptions}
                />
            </div>
        </div>
    );
}
