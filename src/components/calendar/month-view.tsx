import {
    type EventRenderRange,
    sliceEvents,
    type ViewComponentType,
    type ViewContentInfo,
} from "@fullcalendar/react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { type ComponentProps, createContext, useContext } from "react";

import type { Occurrence } from "@/components/calendar/types";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

/**
 * Month view rendered by us instead of FullCalendar's day grid: one CSS grid
 * per week, day cells behind, event bars placed by column and lane on top.
 * Everything is derived from dates, nothing is measured, so the server
 * render is the final layout. FullCalendar still provides the date range
 * (dateProfile), the event slicing (multi-day events cut per week), the
 * toolbar and navigation.
 *
 * The same markup has a second, list layout: the bars shrink to strips
 * without text and each week is followed by its events as a list (day,
 * time, name). The list view (`MonthListView`) renders that way at every
 * width, the month view below the md breakpoint, where seven columns have
 * no room for text (the `list:` variant in globals.css covers both).
 *
 * Registered as a view type of its own on the day grid base (see
 * VIEW_OPTIONS in space-calendar.tsx), which keeps the plugin's date logic
 * (whole weeks) and only swaps the rendering. FullCalendar calls a
 * function component like this one as a render function, with the view
 * props plus the extras sliceEvents needs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

export type MonthViewContextValue = {
    tz: string;
    /** Occurrences of the fetched range, by occurrence id (= event id) */
    occurrences: ReadonlyMap<string, Occurrence>;
    /** Day cells open the create dialog for signed-in users */
    canCreate: boolean;
    /** Receives the clicked day's midnight in the app timezone */
    onDayClick: (date: Date) => void;
    onEventClick: (occurrence: Occurrence) => void;
    /** The occurrence's deep link; bars are links so they work without JS */
    occurrenceHref: (occurrence: Occurrence) => string;
};

// Filled by SpaceCalendar; FullCalendar renders the view inside the same
// React tree, so context reaches it
export const MonthViewContext = createContext<MonthViewContextValue | null>(
    null,
);

// FullCalendar's date markers carry the calendar timezone's wall time in
// their UTC fields, so they are read with UTC accessors / formatted in UTC
function dayKey(marker: Date): string {
    return marker.toISOString().slice(0, 10);
}

type Segment = {
    occurrence: Occurrence;
    /** 1-based column in the week */
    column: number;
    span: number;
    /** False when the bar continues from the previous week */
    isStart: boolean;
    /** False when the bar continues into the next week */
    isEnd: boolean;
    lane: number;
};

/**
 * Cuts the view's event ranges (already day-aligned and clipped to the
 * visible weeks) to one week and assigns lanes so that bars never overlap:
 * longer bars first, then by start, each taking the first free lane.
 */
function layoutWeek(
    ranges: EventRenderRange[],
    weekStart: Date,
    occurrences: ReadonlyMap<string, Occurrence>,
): { segments: Segment[]; lanes: number } {
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekStartMs + DAYS_PER_WEEK * DAY_MS;
    const segments: Omit<Segment, "lane">[] = [];
    for (const r of ranges) {
        const occurrence = occurrences.get(r.def.publicId);
        if (!occurrence) continue;
        const startMs = Math.max(r.range.start.getTime(), weekStartMs);
        const endMs = Math.min(r.range.end.getTime(), weekEndMs);
        if (endMs <= startMs) continue;
        const column = Math.round((startMs - weekStartMs) / DAY_MS) + 1;
        const span = Math.round((endMs - startMs) / DAY_MS);
        segments.push({
            occurrence,
            column,
            span,
            isStart: r.isStart && r.range.start.getTime() >= weekStartMs,
            isEnd: r.isEnd && r.range.end.getTime() <= weekEndMs,
        });
    }
    segments.sort(
        (a, b) =>
            b.span - a.span ||
            a.column - b.column ||
            a.occurrence.dtstart.getTime() - b.occurrence.dtstart.getTime() ||
            a.occurrence.summary.localeCompare(b.occurrence.summary),
    );
    // lanes[i] = columns already taken in lane i
    const lanes: boolean[][] = [];
    const placed: Segment[] = [];
    for (const seg of segments) {
        let lane = lanes.findIndex((taken) => {
            for (let c = seg.column; c < seg.column + seg.span; c++) {
                if (taken[c]) return false;
            }
            return true;
        });
        if (lane === -1) {
            lane = lanes.length;
            lanes.push([]);
        }
        const taken = lanes[lane] as boolean[];
        for (let c = seg.column; c < seg.column + seg.span; c++) {
            taken[c] = true;
        }
        placed.push({ ...seg, lane });
    }
    return { segments: placed, lanes: lanes.length };
}

function EventBar({ segment, tz }: { segment: Segment; tz: string }) {
    const { onEventClick, occurrenceHref } = useMonthViewContext();
    const { occurrence: occ, isStart, isEnd } = segment;
    const time =
        !occ.allDay && isStart
            ? formatInTimeZone(occ.dtstart, tz, "HH:mm")
            : null;
    const label = `${time ? `${time} ` : ""}${occ.summary}`;
    // A tooltip with the full text (names get cut); until scripts run,
    // the browser's own tooltip from a title does the job
    const hydrated = useHydrated();
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {/* A link to the occurrence's deep link (its details
                    without JavaScript); with scripts a plain click opens
                    the dialog instead */}
                <a
                    aria-label={label}
                    className={cn(
                        "z-10 my-0.5 flex min-w-0 items-baseline gap-1 overflow-hidden rounded border-(--fc-event-color) border-2 bg-[color-mix(in_srgb,var(--fc-event-color)_20%,transparent)] px-1.5 py-0.5 text-left text-foreground text-sm leading-tight hover:brightness-95 focus-visible:outline-3 focus-visible:outline-ring/50",
                        // List layout: a strip without text, the week's list has it
                        "list:h-2 list:px-0 list:py-0",
                        // Continuations: no border on the open side, the other
                        // borders dissolve toward it (event-cut* in globals.css)
                        isStart ? "ms-1" : "rounded-s-none border-s-0",
                        isEnd ? "me-1" : "rounded-e-none border-e-0",
                        (!isStart || !isEnd) && "event-cut",
                        !isStart && "event-cut-start",
                        !isEnd && "event-cut-end",
                        `event-${occ.status}`,
                        occ.isDraft && "event-draft",
                        occ.isInternal && "event-internal",
                    )}
                    href={occurrenceHref(occ)}
                    onClick={(e) => {
                        if (
                            e.button !== 0 ||
                            e.metaKey ||
                            e.ctrlKey ||
                            e.shiftKey ||
                            e.altKey
                        ) {
                            return;
                        }
                        e.preventDefault();
                        onEventClick(occ);
                    }}
                    style={{
                        gridColumn: `${segment.column} / span ${segment.span}`,
                        gridRow: segment.lane + 2,
                        // Same variable FullCalendar sets, so the event-* rules in
                        // globals.css apply to both
                        ["--fc-event-color" as string]:
                            occ.color ?? "var(--primary)",
                    }}
                    title={hydrated ? undefined : label}
                    type="button"
                >
                    {time && (
                        <span className="list:hidden shrink-0">{time}</span>
                    )}
                    <span className="list:hidden truncate font-semibold">
                        {occ.summary}
                    </span>
                </a>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * The week's events as a list, the text of the bars in the list layout.
 * Same links as the bars, ordered by day, then start time.
 */
function WeekList({
    segments,
    weekStart,
    tz,
    isOther,
}: {
    segments: Segment[];
    weekStart: Date;
    tz: string;
    isOther: (marker: Date) => boolean;
}) {
    const { onEventClick, occurrenceHref } = useMonthViewContext();
    if (segments.length === 0) return null;
    const sorted = [...segments].sort(
        (a, b) =>
            a.column - b.column ||
            a.occurrence.dtstart.getTime() - b.occurrence.dtstart.getTime(),
    );
    let lastColumn = 0;
    return (
        <ol className="list:grid hidden grid-cols-[3.25rem_3.25rem_1fr] gap-x-2 gap-y-1 border-b px-2 py-2 text-sm">
            {sorted.map((seg) => {
                const { occurrence: occ } = seg;
                const showDay = seg.column !== lastColumn;
                lastColumn = seg.column;
                const day = new Date(
                    weekStart.getTime() + (seg.column - 1) * DAY_MS,
                );
                const last = new Date(day.getTime() + (seg.span - 1) * DAY_MS);
                // A bar continuing from the previous week is all day here;
                // its own days follow the name
                const when =
                    occ.allDay || !seg.isStart
                        ? "all day"
                        : formatInTimeZone(occ.dtstart, tz, "HH:mm");
                const days = !seg.isStart
                    ? `${formatInTimeZone(occ.dtstart, tz, "EEE d")} to ${formatInTimeZone(last, "UTC", "EEE d")}`
                    : seg.span > 1
                      ? `to ${formatInTimeZone(last, "UTC", "EEE d")}`
                      : null;
                return (
                    <li className="contents" key={`${occ.id}:${seg.column}`}>
                        <span
                            className={cn(
                                "font-medium",
                                isOther(day)
                                    ? "text-muted-foreground/60"
                                    : "text-muted-foreground",
                            )}
                        >
                            {showDay && formatInTimeZone(day, "UTC", "EEE d")}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                            {when}
                        </span>
                        <a
                            className={cn(
                                "min-w-0",
                                `event-${occ.status}`,
                                occ.isDraft && "event-draft",
                                occ.isInternal && "event-internal",
                            )}
                            href={occurrenceHref(occ)}
                            onClick={(e) => {
                                if (
                                    e.button !== 0 ||
                                    e.metaKey ||
                                    e.ctrlKey ||
                                    e.shiftKey ||
                                    e.altKey
                                ) {
                                    return;
                                }
                                e.preventDefault();
                                onEventClick(occ);
                            }}
                            style={{
                                ["--fc-event-color" as string]:
                                    occ.color ?? "var(--primary)",
                            }}
                        >
                            <span
                                aria-hidden
                                className="me-1.5 inline-block size-2 rounded-full bg-(--fc-event-color)"
                            />
                            <span className="font-semibold">{occ.summary}</span>
                            {days && (
                                <span className="ms-1.5 inline-block whitespace-nowrap text-muted-foreground">
                                    {days}
                                </span>
                            )}
                        </a>
                    </li>
                );
            })}
        </ol>
    );
}

type DayCellProps = {
    marker: Date;
    column: number;
    isOther: boolean;
    isLastWeek: boolean;
    todayKey: string;
};

// A button while day clicks create events (signed in), a plain cell otherwise
function DayCell({
    marker,
    column,
    isOther,
    isLastWeek,
    todayKey,
}: DayCellProps) {
    const { tz, canCreate, onDayClick } = useMonthViewContext();
    const key = dayKey(marker);
    const isToday = key === todayKey;
    const dayNumber = marker.getUTCDate();
    const label = formatInTimeZone(marker, "UTC", "MMMM d, yyyy");
    const className = cn(
        "flex flex-col text-left",
        !isLastWeek && "border-b",
        column < DAYS_PER_WEEK && "border-e",
        isToday && "bg-accent",
        canCreate &&
            "cursor-pointer focus-visible:outline-3 focus-visible:outline-ring/50 focus-visible:-outline-offset-3",
    );
    const style = { gridColumn: column, gridRow: "1 / -1" };
    const content = (
        <div className="flex h-8 items-center justify-end px-1.5">
            <span
                className={cn(
                    "text-sm",
                    isOther && "text-muted-foreground",
                    isToday &&
                        "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 font-semibold text-primary-foreground",
                )}
            >
                {dayNumber}
            </span>
        </div>
    );
    if (!canCreate) {
        return (
            <div className={className} data-date={key} style={style}>
                {content}
            </div>
        );
    }
    return (
        <button
            aria-label={`Create event on ${label}`}
            className={className}
            data-date={key}
            onClick={() => onDayClick(fromZonedTime(`${key}T00:00:00`, tz))}
            style={style}
            type="button"
        >
            {content}
        </button>
    );
}

function useMonthViewContext(): MonthViewContextValue {
    const ctx = useContext(MonthViewContext);
    if (!ctx) throw new Error("MonthView needs a MonthViewContext provider");
    return ctx;
}

type ViewProps = ComponentProps<ViewComponentType>;

// FullCalendar calls the view's component as a plain render function (from
// a class component), so hooks are only allowed one level down. That
// includes the React Compiler's memo cache, hence "use no memo"
export const MonthView: ViewComponentType = (props) => {
    "use no memo";
    return <MonthGrid {...props} layout="month" />;
};

/** The same weeks in the list layout at every width */
export const MonthListView: ViewComponentType = (props) => {
    "use no memo";
    return <MonthGrid {...props} layout="list" />;
};

function MonthGrid({
    layout,
    ...props
}: ViewProps & { layout: "month" | "list" }) {
    const { tz, occurrences } = useMonthViewContext();
    const { dateProfile } = props;
    const active = dateProfile.activeRange ?? dateProfile.currentRange;
    const dayCount = Math.round(
        (active.end.getTime() - active.start.getTime()) / DAY_MS,
    );
    const weekCount = Math.ceil(dayCount / DAYS_PER_WEEK);
    // Every event as a whole-day range (timed ones by the next-day
    // threshold), clipped to the visible weeks; times come from our data
    const ranges = sliceEvents(props as ViewContentInfo, true);
    const todayKey = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
    const currentStartMs = dateProfile.currentRange.start.getTime();
    const currentEndMs = dateProfile.currentRange.end.getTime();
    const isOther = (marker: Date) => {
        const ms = marker.getTime();
        return ms < currentStartMs || ms >= currentEndMs;
    };

    const weekdays = Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
        const marker = new Date(active.start.getTime() + i * DAY_MS);
        return {
            key: dayKey(marker),
            label: formatInTimeZone(marker, "UTC", "EEE"),
        };
    });

    return (
        <section
            aria-label={props.labelStr}
            className="flex flex-col"
            data-layout={layout}
        >
            <div className="sticky top-0 z-20 grid grid-cols-7 border-b bg-background">
                {weekdays.map((d, i) => (
                    <div
                        className={cn(
                            "py-1.5 text-center font-medium text-sm",
                            i < DAYS_PER_WEEK - 1 && "border-e",
                        )}
                        key={d.key}
                    >
                        {d.label}
                    </div>
                ))}
            </div>
            {Array.from({ length: weekCount }, (_, w) => {
                const weekStart = new Date(
                    active.start.getTime() + w * DAYS_PER_WEEK * DAY_MS,
                );
                const { segments, lanes } = layoutWeek(
                    ranges,
                    weekStart,
                    occurrences,
                );
                const isLastWeek = w === weekCount - 1;
                return (
                    <div key={dayKey(weekStart)}>
                        <div
                            className="grid list:min-h-0 min-h-32 grid-cols-7"
                            style={{
                                // Row 1 holds the day numbers, one row per lane,
                                // a last row takes the remaining height so the day
                                // cells (spanning all rows) fill the week
                                gridTemplateRows: `2rem repeat(${lanes}, auto) minmax(0, 1fr)`,
                            }}
                        >
                            {Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
                                const marker = new Date(
                                    weekStart.getTime() + i * DAY_MS,
                                );
                                return (
                                    <DayCell
                                        column={i + 1}
                                        isLastWeek={isLastWeek}
                                        isOther={isOther(marker)}
                                        key={dayKey(marker)}
                                        marker={marker}
                                        todayKey={todayKey}
                                    />
                                );
                            })}
                            {segments.map((seg) => (
                                <EventBar
                                    key={`${seg.occurrence.id}:${seg.column}`}
                                    segment={seg}
                                    tz={tz}
                                />
                            ))}
                        </div>
                        <WeekList
                            isOther={isOther}
                            segments={segments}
                            tz={tz}
                            weekStart={weekStart}
                        />
                    </div>
                );
            })}
        </section>
    );
}
