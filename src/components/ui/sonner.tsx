import {
    CircleCheckIcon,
    InfoIcon,
    Loader2Icon,
    OctagonXIcon,
    TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { Toaster as Sonner, type ToasterProps, useSonner } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();
    const { toasts } = useSonner();
    const layer = useRef<HTMLDivElement>(null);

    // c4: modal dialogs sit in the top layer, above anything positioned in
    // the page, so the toaster is a top-layer popover too. The top layer
    // stacks in show order and a dialog opened later would cover it, hence
    // it is shown again for every new toast. Under a modal it is inert like
    // the rest of the page: readable, auto-dismissing, not clickable
    useEffect(() => {
        const element = layer.current;
        if (!element) return;
        const shown = element.matches(":popover-open");
        if (shown && toasts.length > 0) element.hidePopover();
        if (!shown || toasts.length > 0) element.showPopover();
    }, [toasts]);

    return (
        <div
            className="fixed inset-auto top-0 left-0 m-0 h-0 w-0 overflow-visible border-0 bg-transparent p-0"
            popover="manual"
            ref={layer}
        >
            <Sonner
                className="toaster group"
                icons={{
                    success: <CircleCheckIcon className="size-4" />,
                    info: <InfoIcon className="size-4" />,
                    warning: <TriangleAlertIcon className="size-4" />,
                    error: <OctagonXIcon className="size-4" />,
                    loading: <Loader2Icon className="size-4 animate-spin" />,
                }}
                style={
                    {
                        "--normal-bg": "var(--popover)",
                        "--normal-text": "var(--popover-foreground)",
                        "--normal-border": "var(--border)",
                        "--border-radius": "var(--radius)",
                    } as React.CSSProperties
                }
                theme={theme as ToasterProps["theme"]}
                {...props}
            />
        </div>
    );
};

export { Toaster };
