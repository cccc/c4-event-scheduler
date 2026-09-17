import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Shown only to visitors without JavaScript, on pages (and links to pages)
 * that cannot work without it: their data loads and their forms submit
 * through scripts.
 */
export function RequiresScriptsAlert({ className }: { className?: string }) {
    return (
        <div className="noscript-only">
            <Alert
                className={cn("mb-6", className)}
                // Static text, not an announcement
                role="note"
                variant="destructive"
            >
                <TriangleAlert />
                <AlertTitle>Requires JavaScript</AlertTitle>
                <AlertDescription>
                    This page does not work with scripts disabled.
                </AlertDescription>
            </Alert>
        </div>
    );
}
