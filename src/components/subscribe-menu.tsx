import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { CalendarPlus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { feedTokenKeys, feedTokenQueries } from "@/lib/queries/feed-token";
import { regenerateFeedToken } from "@/server/fns/feed-token";

/** Append the feed token so the feed includes internal events */
export function withFeedToken(url: string, token: string): string {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}key=${encodeURIComponent(token)}`;
}

function toWebcal(url: string): string {
    return url.replace(/^https?:\/\//, "webcal://");
}

async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Feed URL copied");
}

/**
 * Subscribe controls for one feed URL. "Open in calendar app" uses the
 * webcal: scheme, which Apple Calendar, Outlook, Thunderbird and most
 * mobile calendar apps register as a subscription handler. Signed-in users
 * get a second group whose links carry their feed token, so the feed also
 * contains internal events; opening the menu creates the token if the user
 * has none yet, so the links are always real links.
 *
 * `access` says which groups make sense for the feed:
 * - "public": nothing is hidden without a token (public type in a public
 *   space), so only the public links are offered
 * - "mixed": the token adds content (all events, a public space with
 *   internal types, a public type across private spaces): both groups
 * - "internal": empty without a token (private space, internal type): only
 *   the token links, and nothing for anonymous visitors
 */
export type FeedAccess = "public" | "mixed" | "internal";

export function SubscribeMenu({
    url,
    compact,
    access,
}: {
    url: string;
    compact?: boolean;
    access: FeedAccess;
}) {
    const { session } = useRouteContext({ from: "__root__" });
    const isLoggedIn = !!session?.user;
    const queryClient = useQueryClient();
    const { data: feedToken } = useQuery({
        ...feedTokenQueries.current(),
        enabled: isLoggedIn,
    });
    const createToken = useMutation({
        mutationFn: () => regenerateFeedToken(),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: feedTokenKeys.all }),
        onError: (error) =>
            toast.error(error.message || "Failed to create feed token"),
    });
    const internalUrl =
        isLoggedIn && feedToken ? withFeedToken(url, feedToken.token) : null;

    // feedToken === null means "loaded, none yet" (undefined = still loading)
    const ensureToken = (open: boolean) => {
        if (
            open &&
            isLoggedIn &&
            feedToken === null &&
            !createToken.isPending
        ) {
            createToken.mutate();
        }
    };

    const internal = access === "internal";
    const offerToken = isLoggedIn && access !== "public";

    // Nothing to subscribe to without a token
    if (internal && !isLoggedIn) return null;

    return (
        <>
            {/* Without JavaScript the menu cannot open: a plain link to the
                public feed file instead (nothing to offer for internal-only
                feeds, those need the token) */}
            {!internal && (
                <span className="noscript-only">
                    <Button
                        asChild
                        size="sm"
                        variant={compact ? "ghost" : "outline"}
                    >
                        <a href={url}>
                            <CalendarPlus />
                            Subscribe
                        </a>
                    </Button>
                </span>
            )}
            <DropdownMenu onOpenChange={ensureToken}>
                <DropdownMenuTrigger asChild>
                    <Button
                        className="script-only"
                        size="sm"
                        variant={compact ? "ghost" : "outline"}
                    >
                        <CalendarPlus />
                        Subscribe
                        <ChevronDown className="opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {!internal && (
                        <>
                            {offerToken && (
                                <DropdownMenuLabel>
                                    Public events
                                </DropdownMenuLabel>
                            )}
                            <DropdownMenuItem asChild>
                                <a href={toWebcal(url)}>Open in calendar app</a>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyUrl(url)}>
                                Copy feed URL
                            </DropdownMenuItem>
                        </>
                    )}
                    {offerToken && (
                        <>
                            {!internal && <DropdownMenuSeparator />}
                            <DropdownMenuLabel>
                                {internal
                                    ? "With your feed token"
                                    : "Including internal events"}
                            </DropdownMenuLabel>
                            {internalUrl ? (
                                <>
                                    <DropdownMenuItem asChild>
                                        <a href={toWebcal(internalUrl)}>
                                            Open in calendar app
                                        </a>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => copyUrl(internalUrl)}
                                    >
                                        Copy feed URL
                                    </DropdownMenuItem>
                                </>
                            ) : (
                                <DropdownMenuItem disabled>
                                    Preparing your feed token…
                                </DropdownMenuItem>
                            )}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
