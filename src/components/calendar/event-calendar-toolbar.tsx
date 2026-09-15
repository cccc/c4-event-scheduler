// Source: FullCalendar shadcn registry, item classic-event-calendar
// (https://shadcn-registry.fullcalendar.io/classic-event-calendar.json),
// copied 2026-09-15 for @fullcalendar/react 7.1.0. Import paths point at
// this project's folders; Biome formats the file (its sorting assists are
// off here so the structure stays diffable against upstream).
// Local changes, each marked with a `c4:` comment:
//   - addButton.click typed as a React MouseEventHandler instead of a DOM MouseEvent callback cast with `as any`
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

export interface EventCalendarToolbarProps {
    className?: string;
    controller: CalendarController;
    availableViews: string[];
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
    addButton,
}: EventCalendarToolbarProps) {
    const buttons = controller.getButtonState();

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
                    {buttons.today.text}
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
                <div className="text-xl">{controller.view?.title}</div>
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
                            {buttons[availableView]?.text}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        </div>
    );
}
