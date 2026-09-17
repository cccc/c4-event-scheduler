import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";

/**
 * Copies a URL to the clipboard. Copying needs JavaScript, so without it
 * the button is a link that opens the URL instead (in a new tab).
 * `compact` is the lighter variant for dense lists.
 */
export function CopyUrlButton({
    url,
    compact,
}: {
    url: string;
    compact?: boolean;
}) {
    const variant = compact ? "ghost" : "outline";

    return (
        <>
            <span className="noscript-only">
                <Button asChild size="sm" variant={variant}>
                    <a href={url} rel="noreferrer" target="_blank">
                        Open URL
                    </a>
                </Button>
            </span>
            <CopyButton
                className="script-only"
                label="Copy URL"
                size="sm"
                value={url}
                variant={variant}
            />
        </>
    );
}
