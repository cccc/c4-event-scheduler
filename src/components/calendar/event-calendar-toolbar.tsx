// Source: FullCalendar shadcn registry, item classic-event-calendar
// (https://shadcn-registry.fullcalendar.io/classic-event-calendar.json),
// copied 2026-09-15 for @fullcalendar/react 7.1.0. Import paths point at
// this project's folders; Biome formats the file (its sorting assists are
// off here so the structure stays diffable against upstream).
// Local changes, each marked with a `c4:` comment:
//   - addButton.click typed as a React MouseEventHandler instead of a DOM MouseEvent callback cast with `as any`
//   - `fallbackTitle` prop and static button texts for the server render, where
//     the controller has no calendar yet (its state is only set after mount)
//   - optional `toolbarLinks`: today/prev/next as real links (work without
//     JavaScript, the caller handles client-side navigation in onClick)
//   - the view switcher is `script-only` (views other than the first need
//     JavaScript); its tabs carry `data-view`
//   - laid out as a grid with named areas; below md the title sits between
//     the arrows, Today and the view tabs move to a second row
//   - "use no memo": opted out of the React Compiler, see below
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

// c4
export type NavLink = {
    href: string;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export interface EventCalendarToolbarProps {
    className?: string;
    controller: CalendarController;
    availableViews: string[];
    fallbackTitle?: string; // c4: title for the server render
    toolbarLinks?: { today: NavLink; prev: NavLink; next: NavLink }; // c4
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
    toolbarLinks, // c4
    addButton,
}: EventCalendarToolbarProps) {
    // c4: the controller is one object mutated in place (useCalendarController
    // re-renders with the same reference), so compiler memoization keyed on
    // it would keep a stale title, view and button state
    "use no memo";
    const buttons = controller.getButtonState();
    const text = (
        key: string, // c4
    ) =>
        buttons[key]?.text ||
        FALLBACK_TEXT[key] ||
        key.charAt(0).toUpperCase() + key.slice(1);

    return (
        // c4: a grid with named areas instead of two flex groups, so narrow
        // screens can rearrange: prev, title, next on one row, Today and the
        // view tabs on the next
        <div
            className={cn(
                "grid items-center gap-x-3 gap-y-2",
                "grid-cols-[auto_auto_auto_1fr_auto] [grid-template-areas:'today_prev_next_title_tabs']",
                // Two middle columns so the rows share no column width
                "max-md:grid-cols-[auto_1fr_1fr_auto] max-md:[grid-template-areas:'prev_title_title_next'_'today_today_tabs_tabs']",
                className,
            )}
        >
            <div className="flex items-center shrink-0 gap-3 [grid-area:today]">
                {addButton && (
                    <Button
                        onClick={addButton.click} // c4: no cast
                        aria-label={addButton.hint}
                    >
                        {addButton.text}
                    </Button>
                )}
                {/* c4: as links when toolbarLinks is given */}
                {toolbarLinks ? (
                    <Button
                        asChild
                        aria-label={buttons.today?.hint || text("today")}
                        variant="outline"
                    >
                        <a
                            href={toolbarLinks.today.href}
                            onClick={toolbarLinks.today.onClick}
                        >
                            {text("today")}
                        </a>
                    </Button>
                ) : (
                    <Button
                        onClick={() => controller.today()}
                        aria-label={buttons.today.hint}
                        variant="outline"
                    >
                        {text("today")}
                    </Button>
                )}
            </div>
            {toolbarLinks ? (
                <>
                    <Button
                        asChild
                        aria-label={buttons.prev?.hint || "Previous"}
                        variant="ghost"
                        size="icon"
                        className="[grid-area:prev]"
                    >
                        <a
                            href={toolbarLinks.prev.href}
                            onClick={toolbarLinks.prev.onClick}
                        >
                            <EventCalendarPrevIcon />
                        </a>
                    </Button>
                    <Button
                        asChild
                        aria-label={buttons.next?.hint || "Next"}
                        variant="ghost"
                        size="icon"
                        className="[grid-area:next] md:-ms-3"
                    >
                        <a
                            href={toolbarLinks.next.href}
                            onClick={toolbarLinks.next.onClick}
                        >
                            <EventCalendarNextIcon />
                        </a>
                    </Button>
                </>
            ) : (
                <>
                    <Button
                        onClick={() => controller.prev()}
                        disabled={buttons.prev.isDisabled}
                        aria-label={buttons.prev.hint}
                        variant="ghost"
                        size="icon"
                        className="[grid-area:prev]"
                    >
                        <EventCalendarPrevIcon />
                    </Button>
                    <Button
                        onClick={() => controller.next()}
                        disabled={buttons.next.isDisabled}
                        aria-label={buttons.next.hint}
                        variant="ghost"
                        size="icon"
                        className="[grid-area:next] md:-ms-3"
                    >
                        <EventCalendarNextIcon />
                    </Button>
                </>
            )}
            <div className="text-xl [grid-area:title] max-md:text-center">
                {controller.view?.title ?? fallbackTitle}
            </div>
            <Tabs
                value={controller.view?.type ?? availableViews[0]}
                className="script-only [grid-area:tabs] justify-self-end" // c4: needs JavaScript
            >
                {/* c4: styled like the outline button next to it (white,
                    1px border, same radius), the active tab a muted inset */}
                <TabsList className="rounded-md border bg-background p-[3px] shadow-xs dark:border-input dark:bg-input/30">
                    {availableViews.map((availableView) => (
                        <TabsTrigger
                            key={availableView}
                            value={availableView}
                            data-view={availableView} // c4: lets callers style single tabs
                            className="data-[state=active]:bg-muted data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-muted" // c4
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
