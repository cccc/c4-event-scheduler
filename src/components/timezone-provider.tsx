"use client";

import { createContext, type ReactNode, useContext } from "react";

const TimezoneContext = createContext<string | null>(null);

export function TimezoneProvider({
    tz,
    children,
}: {
    tz: string;
    children: ReactNode;
}) {
    return (
        <TimezoneContext.Provider value={tz}>
            {children}
        </TimezoneContext.Provider>
    );
}

export function useAppTimezone(): string {
    const tz = useContext(TimezoneContext);
    if (tz === null) {
        throw new Error(
            "useAppTimezone must be used inside <TimezoneProvider>",
        );
    }
    return tz;
}
