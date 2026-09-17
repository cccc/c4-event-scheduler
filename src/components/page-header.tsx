import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Title and description at the top of a page, with the page's actions
 * (buttons, menus) on the right.
 */
export function PageHeader({
    title,
    description,
    children,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    /** Actions, right-aligned */
    children?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                // Actions wrap under the title where the row is too narrow
                "mb-8 flex flex-wrap items-start justify-between gap-4",
                className,
            )}
        >
            <div>
                <h1 className="mb-2 font-bold text-3xl">{title}</h1>
                {description && (
                    <div className="text-muted-foreground">{description}</div>
                )}
            </div>
            {children && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {children}
                </div>
            )}
        </div>
    );
}
