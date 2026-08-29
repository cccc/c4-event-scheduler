import handler from "@tanstack/react-start/server-entry";

// Custom server entry: same request handling as the default entry, exported as
// a `{ fetch }` handler so srvx can serve the production bundle (see Dockerfile).
export default {
    async fetch(request: Request): Promise<Response> {
        return handler.fetch(request);
    },
};
