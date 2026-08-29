import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from ".";

/**
 * Server function to read the current session from the incoming request
 * cookies. Use in route `beforeLoad` guards and anywhere the session is
 * needed during SSR. The root route uses `getAppContext` instead, which also
 * resolves the admin flag.
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () =>
    auth.api.getSession({ headers: getRequestHeaders() }),
);
