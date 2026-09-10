import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type EditActionsProps = {
    /** Hidden when the event is already cancelled */
    canCancel: boolean;
    cancelLabel: string;
    onCancel: () => void;
    deleteLabel: string;
    onDelete: () => void;
    pending: boolean;
    deletePending: boolean;
    onClose: () => void;
    /** The form's submit button */
    children: ReactNode;
};

/** Action bar of the edit forms: cancel/delete on the left, close/save on the right. */
export function EditActions({
    canCancel,
    cancelLabel,
    onCancel,
    deleteLabel,
    onDelete,
    pending,
    deletePending,
    onClose,
    children,
}: EditActionsProps) {
    return (
        <div className="flex justify-between gap-2 border-t pt-4">
            <div className="flex gap-2">
                {canCancel && (
                    <Button
                        disabled={pending}
                        onClick={onCancel}
                        type="button"
                        variant="outline"
                    >
                        {cancelLabel}
                    </Button>
                )}
                <Button
                    disabled={deletePending}
                    onClick={onDelete}
                    type="button"
                    variant="destructive"
                >
                    {deleteLabel}
                </Button>
            </div>
            <div className="flex gap-2">
                <Button onClick={onClose} type="button" variant="outline">
                    Close
                </Button>
                {children}
            </div>
        </div>
    );
}
