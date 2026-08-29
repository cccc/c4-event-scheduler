import { createFileRoute } from "@tanstack/react-router";

import { env } from "@/env";
import { generateSpec } from "@/lib/api-v1/spec";

export const Route = createFileRoute("/api/v1/openapi")({
    server: {
        handlers: {
            GET: async () => {
                const spec = generateSpec(env.APP_URL);
                return Response.json(spec, {
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                    },
                });
            },
        },
    },
});
