import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false during SSR and hydration, true once the client has taken over.
 * For content that only exists client-side (like FullCalendar, which
 * builds its DOM in componentDidMount) so a fallback can be server-rendered
 * without a hydration mismatch.
 */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    );
}
