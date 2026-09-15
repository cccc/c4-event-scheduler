// Source: FullCalendar shadcn registry, item classic-event-calendar
// (https://shadcn-registry.fullcalendar.io/classic-event-calendar.json),
// copied 2026-09-15 for @fullcalendar/react 7.1.0. Import paths point at
// this project's folders; Biome formats the file (its sorting assists are
// off here so the structure stays diffable against upstream).
// Local changes, each marked with a `c4:` comment:
//   - addButton.click typed as a React MouseEventHandler instead of a DOM MouseEvent callback cast with `as any`
//   - `fallbackTitle` prop and static button texts for the server render, where
//     the controller has no calendar yet (its state is only set after mount)
/* biome-ignore-all assist/source/useSortedAttributes: keep upstream order */
/* biome-ignore-all lint/nursery/useSortedClasses: keep upstream order */
import type { CalendarController } from "@fullcalendar/react";
import type { MouseEventHandler } from "react"; // c4
import {
    EventCalendarNextIcon,
    EventCalendarPrevIcon,
} from "@/components/calendar/event-calendar-icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// c4: shown until the controller is connected to the mounted calendar (the
// server render and the first client render); replaced by the calendar's
// own texts right after mount
const FALLBACK_TEXT: Record<string, string> = {
    today: "Today",
    dayGridMonth: "Month",
    timeGridWeek: "Week",
    timeGridDay: "Day",
    listWeek: "List",
    listMonth: "List",
    multiMonthYear: "Year",
};

export interface EventCalendarToolbarProps {
    className?: string;
    controller: CalendarController;
    availableViews: string[];
    fallbackTitle?: string; // c4: title for the server render
    addButton?: {
        isPrimary?: boolean;
        text?: string;
        hint?: string;
        click?: MouseEventHandler<HTMLButtonElement>; // c4: React handler type
    };
}

export function EventCalendarToolbar({
    className,
    controller,
    availableViews,
    fallbackTitle, // c4
    addButton,
}: EventCalendarToolbarProps) {
    const buttons = controller.getButtonState();
    const text = (
        key: string, // c4
    ) =>
        buttons[key]?.text ||
        FALLBACK_TEXT[key] ||
        key.charAt(0).toUpperCase() + key.slice(1);

    return (
        <div
            className={cn(
                "flex items-center justify-between flex-wrap gap-3",
                className,
            )}
        >
            <div className="flex items-center shrink-0 gap-3">
                {addButton && (
                    <Button
                        onClick={addButton.click} // c4: no cast
                        aria-label={addButton.hint}
                    >
                        {addButton.text}
                    </Button>
                )}
                <Button
                    onClick={() => controller.today()}
                    aria-label={buttons.today.hint}
                    variant="outline"
                >
                    {text("today")}
                </Button>
                <div className="flex items-center">
                    <Button
                        onClick={() => controller.prev()}
                        disabled={buttons.prev.isDisabled}
                        aria-label={buttons.prev.hint}
                        variant="ghost"
                        size="icon"
                    >
                        <EventCalendarPrevIcon />
                    </Button>
                    <Button
                        onClick={() => controller.next()}
                        disabled={buttons.next.isDisabled}
                        aria-label={buttons.next.hint}
                        variant="ghost"
                        size="icon"
                    >
                        <EventCalendarNextIcon />
                    </Button>
                </div>
                <div className="text-xl">
                    {controller.view?.title ?? fallbackTitle}
                </div>
            </div>
            <Tabs value={controller.view?.type ?? availableViews[0]}>
                <TabsList>
                    {availableViews.map((availableView) => (
                        <TabsTrigger
                            key={availableView}
                            value={availableView}
                            onClick={() => controller.changeView(availableView)}
                            aria-label={buttons[availableView]?.hint}
                        >
                            {text(availableView)}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    );
}
