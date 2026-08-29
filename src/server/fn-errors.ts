import { setResponseStatus } from "@tanstack/react-start/server";

/**
 * Error thrown from server functions. The HTTP status is also applied to the
 * response so clients (and logs) can distinguish 401/403/404 from crashes.
 * Replaces the TRPCError codes from the old tRPC layer.
 */
export class AppError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "AppError";
    }
}

function httpError(status: number, message: string): AppError {
    try {
        setResponseStatus(status);
    } catch {
        // Not inside a server-function request (e.g. called from a script); the
        // status is still carried on the error itself.
    }
    return new AppError(status, message);
}

export const badRequest = (message = "Bad request") => httpError(400, message);
export const unauthorized = (message = "Unauthorized") =>
    httpError(401, message);
export const forbidden = (message = "Forbidden") => httpError(403, message);
export const notFound = (message = "Not found") => httpError(404, message);
