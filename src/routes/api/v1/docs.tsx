import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export const Route = createFileRoute("/api/v1/docs")({
    head: () => ({ meta: [{ title: "C4 Events API Docs" }] }),
    component: ApiDocsPage,
});

// swagger-ui-react touches `window` at import/render time, so it is only
// rendered on the client.
function ApiDocsPage() {
    return (
        <ClientOnly fallback={<p>Loading API docs...</p>}>
            <SwaggerUI url="/api/v1/openapi" />
        </ClientOnly>
    );
}
