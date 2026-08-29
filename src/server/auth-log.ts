import { env } from "@/env";

export type AuthLogLevel = "debug" | "info" | "warn" | "error";
export type AuthLogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<AuthLogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const CONSOLE: Record<AuthLogLevel, (...args: unknown[]) => void> = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
};

const SAFE_VALUE = /^[A-Za-z0-9_.:/@*-]+$/;

// Errors nested inside arrays/objects would serialize to `{}`; expand them so
// the message and cause chain survive JSON.stringify.
function expandErrors(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            ...(value.cause !== undefined ? { cause: value.cause } : {}),
        };
    }
    return value;
}

function formatValue(value: unknown): string {
    if (value instanceof Error) {
        return value.cause instanceof Error
            ? JSON.stringify(`${value.message} (cause: ${value.cause.message})`)
            : JSON.stringify(value.message);
    }
    if (typeof value === "string") {
        return SAFE_VALUE.test(value) ? value : JSON.stringify(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return JSON.stringify(value, expandErrors);
}

function formatFields(fields: AuthLogFields): string {
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${formatValue(v)}`)
        .join(" ");
}

function emit(level: AuthLogLevel, message: string, fields?: AuthLogFields) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[env.AUTH_LOG_LEVEL]) return;
    const suffix = fields ? formatFields(fields) : "";
    CONSOLE[level](
        `[auth] ${level.toUpperCase()} ${message}${suffix ? ` ${suffix}` : ""}`,
    );
}

/**
 * Structured-ish logger for authentication and authorization events.
 * Emits single-line "[auth] LEVEL message key=value ..." entries so they are
 * easy to grep in container logs. Verbosity is controlled by AUTH_LOG_LEVEL.
 */
export const authLog = {
    debug: (message: string, fields?: AuthLogFields) =>
        emit("debug", message, fields),
    info: (message: string, fields?: AuthLogFields) =>
        emit("info", message, fields),
    warn: (message: string, fields?: AuthLogFields) =>
        emit("warn", message, fields),
    error: (message: string, fields?: AuthLogFields) =>
        emit("error", message, fields),
};
