import { useMutation, useQueryClient } from "@tanstack/react-query";

import { eventsKeys } from "@/lib/queries/events";

/**
 * Wraps an events server function as a mutation that invalidates the
 * events cache on success (and typically closes the dialog).
 */
export function useEventMutation<TInput>(
    fn: (opts: { data: TInput }) => Promise<unknown>,
    onSuccess?: () => void,
) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: TInput) => fn({ data: input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: eventsKeys.all });
            onSuccess?.();
        },
    });
}
