import { Slot } from "@radix-ui/react-slot";
import { XIcon } from "lucide-react";
import {
    createContext,
    useContext,
    useId,
    useLayoutEffect,
    useState,
} from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * c4: dialogs on the native <dialog> element instead of Radix, so there is
 * no portal. `Dialog` renders its children only while open: a closed dialog
 * is unmounted (forms start fresh every time) and an open one is part of the
 * server HTML. `DialogContent` carries the `open` attribute in that HTML,
 * which without scripts is a card in the page (globals.css, the noscript
 * style in __root.tsx); once mounted with scripts it reopens as a modal: top
 * layer, backdrop, the rest of the page inert, focus kept inside, Escape.
 * Closing is a view transition in which the dialog unmounts at once and its
 * last frame zooms out (globals.css), so nothing stays mounted to animate.
 * Popups inside a dialog (select, popover, menu, tooltip) portal into the
 * dialog element through `useDialogContainer`; everything outside it is
 * inert while the dialog is open.
 */

type DialogContextValue = {
    close: () => void;
    titleId: string;
    descriptionId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);
const DialogContainerContext = createContext<HTMLElement | null>(null);

function useDialog() {
    const context = useContext(DialogContext);
    if (!context) throw new Error("Dialog parts must be inside <Dialog>");
    return context;
}

/** The open dialog element popups should portal into; null outside one */
function useDialogContainer() {
    return useContext(DialogContainerContext);
}

function Dialog({
    open = false,
    onOpenChange,
    children,
}: {
    open?: boolean;
    /** May return a promise (a navigation) the close transition waits for */
    onOpenChange?: (open: boolean) => unknown;
    children: React.ReactNode;
}) {
    const titleId = useId();
    const descriptionId = useId();
    const close = () => {
        if (!onOpenChange) return;
        if (typeof document.startViewTransition !== "function") {
            onOpenChange(false);
            return;
        }
        // flushSync commits a plain state change inside the callback; a
        // returned promise (URL-driven dialogs navigate) is waited for
        document.startViewTransition(
            () => flushSync(() => onOpenChange(false)) as Promise<void>,
        );
    };
    if (!open) return null;
    return (
        <DialogContext value={{ close, titleId, descriptionId }}>
            {children}
        </DialogContext>
    );
}

function DialogContent({
    className,
    children,
    showCloseButton = true,
    style,
    ...props
}: React.ComponentProps<"dialog"> & {
    showCloseButton?: boolean;
}) {
    const { close, titleId, descriptionId } = useDialog();
    const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
    // Unique per dialog (names must be) plus the shared "dialog" class for
    // the zoom-out in globals.css
    const viewTransitionName = `dialog-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

    useLayoutEffect(() => {
        if (!dialog || dialog.matches(":modal")) return;
        // Removing the attribute, unlike close(), fires no close event
        dialog.removeAttribute("open");
        dialog.showModal();
    }, [dialog]);

    return (
        <DialogContainerContext value={dialog}>
            <dialog
                aria-describedby={descriptionId}
                aria-labelledby={titleId}
                // Light dismiss (a click on the backdrop) as a cancel event,
                // like Escape; not in the JSX types yet
                {...{ closedby: "any" }}
                className={cn(
                    "m-auto max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50 sm:max-w-lg",
                    // Without scripts (never modal): a card above the content
                    "[&:not(:modal)]:static [&:not(:modal)]:mb-6 [&:not(:modal)]:max-w-none",
                    className,
                )}
                onCancel={(event) => {
                    // Keep it open so the close transition can capture it
                    event.preventDefault();
                    close();
                }}
                onClose={close}
                open
                ref={setDialog}
                style={{
                    viewTransitionName,
                    viewTransitionClass: "dialog",
                    ...style,
                }}
                {...props}
            >
                <div className="relative grid gap-4 p-6">
                    {children}
                    {showCloseButton && (
                        <DialogClose
                            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                            data-slot="dialog-close"
                        >
                            <XIcon />
                            <span className="sr-only">Close</span>
                        </DialogClose>
                    )}
                </div>
            </dialog>
        </DialogContainerContext>
    );
}

function DialogClose({
    asChild,
    onClick,
    ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
    const { close } = useDialog();
    const Comp = asChild ? Slot : "button";
    return (
        <Comp
            data-slot="dialog-close"
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) close();
            }}
            type="button"
            {...props}
        />
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            className={cn(
                "flex flex-col gap-2 text-center sm:text-left",
                className,
            )}
            data-slot="dialog-header"
            {...props}
        />
    );
}

function DialogFooter({
    className,
    showCloseButton = false,
    children,
    ...props
}: React.ComponentProps<"div"> & {
    showCloseButton?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
                className,
            )}
            data-slot="dialog-footer"
            {...props}
        >
            {children}
            {showCloseButton && (
                <DialogClose asChild>
                    <Button variant="outline">Close</Button>
                </DialogClose>
            )}
        </div>
    );
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
    const { titleId } = useDialog();
    return (
        <h2
            className={cn("font-semibold text-lg leading-none", className)}
            data-slot="dialog-title"
            id={titleId}
            {...props}
        />
    );
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
    const { descriptionId } = useDialog();
    return (
        <p
            className={cn("text-muted-foreground text-sm", className)}
            data-slot="dialog-description"
            id={descriptionId}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    useDialogContainer,
};
