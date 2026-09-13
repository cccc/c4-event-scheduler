import { Skeleton } from "@/components/ui/skeleton";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// Which cells get a fake event bar, so the grid does not look uniform
const EVENT_CELLS = new Set([2, 9, 11, 16, 23, 25, 30, 37]);
const CELLS = Array.from({ length: 6 * WEEKDAYS.length }, (_, i) => ({
    id: `cell-${i}`,
    hasEvent: EVENT_CELLS.has(i),
}));

/**
 * Server-rendered stand-in for the month view until FullCalendar mounts
 * (it only renders client-side). Roughly the same height as the real grid
 * so the page does not jump.
 */
export function CalendarSkeleton({ feedUrl }: { feedUrl: string }) {
    return (
        <div
            aria-busy="true"
            aria-label="Loading calendar"
            className="relative"
            role="status"
        >
            <div className="mb-4 flex items-center justify-between">
                <div className="flex gap-1">
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="ml-1 h-9 w-16" />
                </div>
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-9 w-44" />
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
                {WEEKDAYS.map((day) => (
                    <div className="bg-card p-2" key={day}>
                        <Skeleton className="mx-auto h-4 w-8" />
                    </div>
                ))}
                {CELLS.map((cell) => (
                    <div className="h-24 bg-card p-2" key={cell.id}>
                        <Skeleton className="ml-auto h-3 w-5" />
                        {cell.hasEvent && (
                            <Skeleton className="mt-3 h-5 w-full" />
                        )}
                    </div>
                ))}
            </div>
            {/* Sticky inside the overlay: stays mid-viewport while the
                skeleton (taller than most screens) is in view */}
            <div className="noscript-only">
                <div className="absolute inset-0">
                    <div className="sticky top-[calc(50vh-4rem)] flex justify-center px-4">
                        <p className="max-w-md rounded-lg border bg-card px-6 py-4 text-center text-lg shadow-lg">
                            The calendar needs JavaScript.
                            <br />
                            <span className="text-base text-muted-foreground">
                                Without it,{" "}
                                <a className="underline" href={feedUrl}>
                                    subscribe to the iCal feed
                                </a>{" "}
                                instead.
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
