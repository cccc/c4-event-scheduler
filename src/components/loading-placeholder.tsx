import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LINE_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-1/3"];

/**
 * Stands in for content that is fetched in the browser (useQuery without a
 * loader prefetch; render it while `isPending`, which is also the server's
 * state, not `isLoading`, which is false there). Skeleton rows the height
 * of what is coming: cards for a list, text lines for a form. Without
 * scripts nothing will ever load, so the first row says so.
 */
export function LoadingPlaceholder({
    rows = 3,
    kind = "cards",
    className,
}: {
    /** Up to four */
    rows?: number;
    kind?: "cards" | "lines";
    className?: string;
}) {
    const cards = kind === "cards";
    return (
        <div
            aria-label="Loading"
            className={cn(cards ? "space-y-4" : "space-y-3", className)}
            role="status"
        >
            {LINE_WIDTHS.slice(0, rows).map((width, i) => (
                <Skeleton
                    className={cn(
                        "flex items-center",
                        cards ? "min-h-24 px-4" : "min-h-4 px-3",
                        !cards && width,
                    )}
                    key={width}
                >
                    {i === 0 && (
                        <span className="noscript-only text-muted-foreground text-sm">
                            Requires JavaScript to load.
                        </span>
                    )}
                </Skeleton>
            ))}
        </div>
    );
}
