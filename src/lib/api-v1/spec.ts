import {
    OpenAPIRegistry,
    OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
    CreateEventSchema,
    ErrorSchema,
    EventDetailSchema,
    EventSchema,
    EventTypeSchema,
    OccurrenceOverrideSchema,
    OccurrenceSchema,
    SpaceSchema,
    UpsertOverrideSchema,
} from "./schemas";

const registry = new OpenAPIRegistry();

// ─── Security scheme ──────────────────────────────────────────────────────────

registry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "c4k_…",
    description:
        "Machine-to-machine API key. Obtain from **Admin → API Keys**. Format: `c4k_<random>#<fingerprint>`",
});

// ─── Reusable response components ────────────────────────────────────────────

const authNote =
    "When no valid API key is provided, draft events are hidden and author fields (`createdByActor`, `updatedByActor`, `createdByActorId`, `updatedByActorId`) are omitted from all responses.";

const errorResponses = {
    400: {
        description: "Bad request — invalid query parameters or request body",
        content: { "application/json": { schema: ErrorSchema } },
    },
    401: {
        description: "Unauthorized — a valid API key is required",
        content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
        description:
            "Forbidden — the API key lacks permission for this resource",
        content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
    },
    422: {
        description: "Validation error — request body failed schema validation",
        content: {
            "application/json": {
                schema: z.object({ error: z.string(), details: z.unknown() }),
            },
        },
    },
} as const;

// Security shorthand: send the token if configured, but don't require it.
// An empty object in the security array means "unauthenticated is also valid".
const optionalAuth = [{} as Record<string, string[]>, { BearerAuth: [] }];

// ─── /api/v1/events ───────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/api/v1/events",
    tags: ["Events"],
    summary: "List events",
    security: optionalAuth,
    description: `Returns a paginated list of events. ${authNote}`,
    request: {
        query: z.object({
            spaceSlug: z.string().optional().openapi({
                description: "Filter by space slug",
                example: "my-space",
            }),
            eventTypeSlug: z.string().optional().openapi({
                description: "Filter by event type slug",
                example: "meetup",
            }),
            status: z
                .enum(["tentative", "confirmed", "cancelled"])
                .optional()
                .openapi({ description: "Filter by iCal status" }),
            start: z.string().optional().openapi({
                description:
                    "Include events with dtstart at or after this ISO datetime",
                example: "2025-01-01T00:00:00Z",
            }),
            end: z.string().optional().openapi({
                description:
                    "Include events with dtstart at or before this ISO datetime",
                example: "2025-12-31T23:59:59Z",
            }),
            limit: z.string().optional().openapi({
                description: "Max results per page (1–100, default 50)",
            }),
            cursor: z.string().optional().openapi({
                description:
                    "Keyset pagination cursor — pass the `nextCursor` value from the previous response",
            }),
        }),
    },
    responses: {
        200: {
            description: "Paginated event list",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.array(EventSchema),
                        total: z.number().int(),
                        nextCursor: z.string().datetime().optional(),
                    }),
                },
            },
        },
        ...errorResponses,
    },
});

registry.registerPath({
    method: "post",
    path: "/api/v1/events",
    tags: ["Events"],
    summary: "Create event",
    security: [{ BearerAuth: [] }],
    request: {
        body: {
            required: true,
            content: { "application/json": { schema: CreateEventSchema } },
        },
    },
    responses: {
        201: {
            description: "Event created",
            content: {
                "application/json": { schema: z.object({ data: EventSchema }) },
            },
        },
        ...errorResponses,
    },
});

// ─── /api/v1/events/{id} ─────────────────────────────────────────────────────

const eventIdParam = z.object({ id: z.string().uuid() });

registry.registerPath({
    method: "get",
    path: "/api/v1/events/{id}",
    tags: ["Events"],
    summary: "Get event",
    security: optionalAuth,
    description: `Returns a single event with its occurrence overrides. ${authNote}`,
    request: { params: eventIdParam },
    responses: {
        200: {
            description: "Event detail",
            content: {
                "application/json": {
                    schema: z.object({ data: EventDetailSchema }),
                },
            },
        },
        ...errorResponses,
    },
});

registry.registerPath({
    method: "put",
    path: "/api/v1/events/{id}",
    tags: ["Events"],
    summary: "Upsert event",
    description:
        "Creates the event with the given ID if it does not exist (201), or fully replaces it if it does (200). The body must always be a complete event payload.",
    security: [{ BearerAuth: [] }],
    request: {
        params: eventIdParam,
        body: {
            required: true,
            content: { "application/json": { schema: CreateEventSchema } },
        },
    },
    responses: {
        200: {
            description: "Event replaced",
            content: {
                "application/json": { schema: z.object({ data: EventSchema }) },
            },
        },
        201: {
            description: "Event created",
            content: {
                "application/json": { schema: z.object({ data: EventSchema }) },
            },
        },
        ...errorResponses,
    },
});

registry.registerPath({
    method: "delete",
    path: "/api/v1/events/{id}",
    tags: ["Events"],
    summary: "Delete event",
    security: [{ BearerAuth: [] }],
    request: { params: eventIdParam },
    responses: {
        200: {
            description: "Event deleted",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.object({ success: z.literal(true) }),
                    }),
                },
            },
        },
        ...errorResponses,
    },
});

// ─── /api/v1/events/{id}/occurrences ─────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/api/v1/events/{id}/occurrences",
    tags: ["Occurrences"],
    summary: "List expanded occurrences",
    security: optionalAuth,
    description:
        "Expands the RRULE and returns concrete occurrences for the given date range, with overrides applied.",
    request: {
        params: eventIdParam,
        query: z.object({
            start: z.string().openapi({
                description: "Range start (ISO datetime)",
                example: "2025-06-01T00:00:00Z",
            }),
            end: z.string().openapi({
                description: "Range end (ISO datetime)",
                example: "2025-06-30T23:59:59Z",
            }),
        }),
    },
    responses: {
        200: {
            description: "Expanded occurrences",
            content: {
                "application/json": {
                    schema: z.object({ data: z.array(OccurrenceSchema) }),
                },
            },
        },
        ...errorResponses,
    },
});

// ─── /api/v1/events/{id}/occurrences/{date} ───────────────────────────────────

const occurrenceParams = z.object({
    id: z.string().uuid(),
    date: z.string().openapi({
        description: "Occurrence date in YYYY-MM-DD format",
        example: "2025-06-08",
    }),
});

registry.registerPath({
    method: "put",
    path: "/api/v1/events/{id}/occurrences/{date}",
    tags: ["Occurrences"],
    summary: "Upsert occurrence override",
    description:
        "Creates or updates an override for a specific occurrence of a recurring event. Also bumps the parent event's `sequence` counter.",
    security: [{ BearerAuth: [] }],
    request: {
        params: occurrenceParams,
        body: {
            required: true,
            content: { "application/json": { schema: UpsertOverrideSchema } },
        },
    },
    responses: {
        200: {
            description: "Override upserted",
            content: {
                "application/json": {
                    schema: z.object({ data: OccurrenceOverrideSchema }),
                },
            },
        },
        ...errorResponses,
    },
});

registry.registerPath({
    method: "delete",
    path: "/api/v1/events/{id}/occurrences/{date}",
    tags: ["Occurrences"],
    summary: "Delete occurrence",
    description:
        "For single events: deletes the entire event. For recurring events: adds the date to `exdates` and removes any override.",
    security: [{ BearerAuth: [] }],
    request: { params: occurrenceParams },
    responses: {
        200: {
            description: "Occurrence deleted",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.object({
                            success: z.literal(true),
                            deleted: z.enum(["event", "occurrence"]),
                        }),
                    }),
                },
            },
        },
        ...errorResponses,
    },
});

// ─── /api/v1/events/{id}/occurrences/{date}/override ─────────────────────────

registry.registerPath({
    method: "delete",
    path: "/api/v1/events/{id}/occurrences/{date}/override",
    tags: ["Occurrences"],
    summary: "Remove occurrence override",
    description:
        "Removes a specific occurrence override, reverting it to the series defaults. The occurrence itself is NOT deleted.",
    security: [{ BearerAuth: [] }],
    request: { params: occurrenceParams },
    responses: {
        200: {
            description: "Override removed",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.object({ success: z.literal(true) }),
                    }),
                },
            },
        },
        ...errorResponses,
    },
});

// ─── /api/v1/spaces ───────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/api/v1/spaces",
    tags: ["Spaces"],
    summary: "List spaces",
    security: optionalAuth,
    description:
        "Returns all public spaces plus any private spaces accessible to the API key. No auth required for public spaces.",
    responses: {
        200: {
            description: "Spaces list",
            content: {
                "application/json": {
                    schema: z.object({ data: z.array(SpaceSchema) }),
                },
            },
        },
    },
});

// ─── /api/v1/event-types ─────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/api/v1/event-types",
    tags: ["Event Types"],
    summary: "List event types",
    security: optionalAuth,
    request: {
        query: z.object({
            spaceSlug: z.string().optional().openapi({
                description: "Filter to event types belonging to this space",
            }),
        }),
    },
    responses: {
        200: {
            description: "Event types list",
            content: {
                "application/json": {
                    schema: z.object({ data: z.array(EventTypeSchema) }),
                },
            },
        },
        404: errorResponses[404],
    },
});

// ─── Generator ───────────────────────────────────────────────────────────────

export function generateSpec(serverUrl: string) {
    return new OpenApiGeneratorV3(registry.definitions).generateDocument({
        openapi: "3.0.3",
        info: {
            title: "C4 Event Scheduler API",
            version: "1",
            description:
                "REST API for managing events, spaces and event types.\n\nAuthenticate with an API key obtained from **Admin → API Keys** by passing it in the `Authorization` header:\n\n```\nAuthorization: Bearer c4k_…\n```",
        },
        servers: [{ url: serverUrl }],
    });
}
