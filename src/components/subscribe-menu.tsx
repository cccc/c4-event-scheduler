import { CalendarPlus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Subscribe controls for one feed URL. "Open in calendar app" uses the
 * webcal: scheme, which Apple Calendar, Outlook, Thunderbird and most
 * mobile calendar apps register as a subscription handler.
 */
export function SubscribeMenu({
    url,
    compact,
}: {
    url: string;
    compact?: boolean;
}) {
    const webcal = url.replace(/^https?:\/\//, "webcal://");

    const copy = async () => {
        await navigator.clipboard.writeText(url);
        toast.success("Feed URL copied");
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" variant={compact ? "ghost" : "outline"}>
                    <CalendarPlus />
                    Subscribe
                    <ChevronDown className="opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <a href={webcal}>Open in calendar app</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={copy}>
                    Copy feed URL
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
