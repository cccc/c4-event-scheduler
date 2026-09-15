import {
    type EventRenderRange,
    sliceEvents,
    type ViewComponentType,
    type ViewContentInfo,
} from "@fullcalendar/react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { type ComponentProps, createContext, useContext } from "react";

import type { Occurrence } from "@/components/calendar/types";
import { cn } from "@/lib/utils";

/**
 * Month view rendered by us instead of FullCalendar's day grid: one CSS grid
 * per week, day cells behind, event bars placed by column and lane on top.
 * Everything is derived from dates, nothing is measured, so the server
 * render is the final layout. FullCalendar still provides the date range
 * (dateProfile), the event slicing (multi-day events cut per week), the
 * toolbar and navigation.
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
    return (
        // A link to the occurrence's deep link (its details without
        // JavaScript); with scripts a plain click opens the dialog instead
        <a
            aria-label={`${time ? `${time} ` : ""}${occ.summary}`}
            className={cn(
                "z-10 my-0.5 flex min-w-0 items-baseline gap-1 overflow-hidden rounded border-(--fc-event-color) border-2 bg-[color-mix(in_srgb,var(--fc-event-color)_20%,transparent)] px-1.5 py-0.5 text-left text-foreground text-sm leading-tight hover:brightness-95 focus-visible:outline-3 focus-visible:outline-ring/50",
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
                ["--fc-event-color" as string]: occ.color ?? "var(--primary)",
            }}
            type="button"
        >
            {time && <span className="shrink-0">{time}</span>}
            <span className="truncate font-semibold">{occ.summary}</span>
        </a>
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
// a class component), so hooks are only allowed one level down
export const MonthView: ViewComponentType = (props) => <MonthGrid {...props} />;

function MonthGrid(props: ViewProps) {
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

    const weekdays = Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
        const marker = new Date(active.start.getTime() + i * DAY_MS);
        return {
            key: dayKey(marker),
            label: formatInTimeZone(marker, "UTC", "EEE"),
        };
    });

    return (
        <section aria-label={props.labelStr} className="flex flex-col">
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
                    <div
                        className="grid min-h-32 grid-cols-7"
                        key={dayKey(weekStart)}
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
                            const ms = marker.getTime();
                            return (
                                <DayCell
                                    column={i + 1}
                                    isLastWeek={isLastWeek}
                                    isOther={
                                        ms < currentStartMs ||
                                        ms >= currentEndMs
                                    }
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
                );
            })}
        </section>
    );
}
