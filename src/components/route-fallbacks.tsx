import { Link, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

// 404 / error screens registered router-wide in src/router.tsx. Without these,
// notFound() and loader errors render TanStack's unstyled defaults.

export function NotFoundView() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
            <p className="font-bold text-6xl text-muted-foreground/40">404</p>
            <h1 className="font-semibold text-foreground text-xl">
                Nothing here
            </h1>
            <p className="max-w-sm text-muted-foreground text-sm">
                This page doesn't exist, or the space it pointed at is gone.
            </p>
            <Button asChild variant="outline">
                <Link to="/">Back to the calendar</Link>
            </Button>
        </div>
    );
}

export function ErrorView({ error }: { error: Error }) {
    const router = useRouter();
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
            <h1 className="font-semibold text-foreground text-xl">
                Something went wrong
            </h1>
            <p className="max-w-md text-muted-foreground text-sm">
                {error.message || "An unexpected error occurred."}
            </p>
            <div className="flex gap-2">
                <Button
                    onClick={() => void router.invalidate()}
                    variant="outline"
                >
                    Try again
                </Button>
                <Button asChild variant="ghost">
                    <Link to="/">Back to the calendar</Link>
                </Button>
            </div>
        </div>
    );
}
