import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { SecretInput } from "@/components/secret-input";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { feedTokenKeys, feedTokenQueries } from "@/lib/queries/feed-token";
import { regenerateFeedToken } from "@/server/fns/feed-token";

/**
 * The feed token on the account page. Tokens exist on demand: the card
 * creates one when the user has none yet, so it only ever shows a token.
 */
export function FeedTokenCard() {
    const queryClient = useQueryClient();
    const { data: feedToken } = useQuery(feedTokenQueries.current());

    const regenerate = useMutation({
        mutationFn: () => regenerateFeedToken(),
        onSuccess: (_result, _input, _ctx) => {
            queryClient.invalidateQueries({ queryKey: feedTokenKeys.all });
        },
        onError: (error) => toast.error(error.message),
    });
    const { mutate: createToken, isPending: creating } = regenerate;

    // null = loaded and none yet (undefined = still loading)
    useEffect(() => {
        if (feedToken === null && !creating) createToken();
    }, [feedToken, creating, createToken]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Feed token</CardTitle>
                <CardDescription>
                    Calendar subscriptions built with this token include
                    internal event types and private spaces. The Subscribe menus
                    use it for their "including internal events" links. It only
                    works for iCal feeds, never for the REST API, and anyone who
                    has the link can read those feeds, so treat it like a
                    password.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <SecretInput
                        className="flex-1"
                        label="Feed token"
                        prefix="c4f_"
                        value={feedToken?.token}
                    />
                    <Button
                        disabled={!feedToken || regenerate.isPending}
                        onClick={() => {
                            if (
                                confirm(
                                    "Regenerate the feed token? Every calendar subscription that uses the current token stops working.",
                                )
                            ) {
                                regenerate.mutate(undefined, {
                                    onSuccess: () =>
                                        toast.success("Feed token regenerated"),
                                });
                            }
                        }}
                        size="sm"
                        variant="outline"
                    >
                        Regenerate
                    </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                    Append it to any feed URL as <code>?key=…</code>. If it
                    leaked, regenerate it: every subscription built with the old
                    token then stops working.
                </p>
            </CardContent>
        </Card>
    );
}
