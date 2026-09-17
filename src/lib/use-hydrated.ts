import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server render and during hydration, true afterwards, for
 * markup that only makes sense until scripts take over (a `title` as the
 * tooltip fallback, say). Hydration-safe: the server snapshot is used
 * until React has hydrated, then it re-renders with the client value.
 */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    );
}
