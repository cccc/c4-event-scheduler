/**
 * Centralised Zod schemas for the /api/v1 REST API.
 *
 * `extendZodWithOpenApi` must be called here (once, at module load time)
 * before any `.openapi()` annotations are used.  All route files that need
 * request-validation schemas import from this module instead of defining
 * their own, which keeps the OpenAPI spec and the runtime validation in sync.
 */
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// ─── Primitive / shared ──────────────────────────────────────────────────────

export const ICalStatusSchema = z
    .enum(["tentative", "confirmed", "cancelled"])
    .openapi({ example: "confirmed" });

// ─── Nested object schemas (used inside event responses) ─────────────────────

export const SpaceSummarySchema = z
    .object({
        id: z.string().uuid(),
        slug: z.string(),
        name: z.string(),
    })
    .openapi("SpaceSummary");

export const EventTypeSummarySchema = z
    .object({
        id: z.string().uuid(),
        slug: z.string(),
        name: z.string(),
    })
    .openapi("EventTypeSummary");

export const ActorSummarySchema = z
    .object({
        kind: z.enum(["user", "apiKey"]),
        user: z.object({ name: z.string() }).nullable(),
        apiKey: z.object({ name: z.string() }).nullable(),
    })
    .nullable()
    .openapi("ActorSummary");

export const OccurrenceOverrideSchema = z
    .object({
        id: z.string().uuid(),
        eventId: z.string().uuid(),
        occurrenceDate: z.string().openapi({ example: "2025-06-08" }),
        status: ICalStatusSchema.nullable(),
        notes: z.string().nullable(),
        summary: z.string().nullable(),
        description: z.string().nullable(),
        url: z.string().nullable(),
        location: z.string().nullable(),
        dtstart: z.string().datetime().nullable(),
        dtend: z.string().datetime().nullable(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
    })
    .openapi("OccurrenceOverride");

// ─── Event response schemas ───────────────────────────────────────────────────

const eventBaseShape = {
    id: z.string().uuid(),
    spaceId: z.string().uuid(),
    eventTypeId: z.string().uuid(),
    createdByActorId: z.string().uuid().nullable(),
    updatedByActorId: z.string().uuid().nullable(),
    summary: z.string().openapi({ example: "Team Meeting" }),
    description: z.string().nullable(),
    url: z.string().nullable(),
    location: z.string().nullable(),
    dtstart: z.string().datetime(),
    dtend: z.string().datetime().nullable(),
    timezone: z.string().openapi({ example: "Europe/Berlin" }),
    allDay: z.boolean(),
    rrule: z.string().nullable().openapi({ example: "FREQ=WEEKLY;BYDAY=WE" }),
    recurrenceEndDate: z.string().datetime().nullable(),
    exdates: z.array(z.string()).openapi({ example: ["2025-06-08"] }),
    frequencyLabel: z.string().nullable(),
    status: ICalStatusSchema,
    isDraft: z.boolean(),
    sequence: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    space: SpaceSummarySchema,
    eventType: EventTypeSummarySchema,
    createdByActor: ActorSummarySchema,
    updatedByActor: ActorSummarySchema,
};

/** Event as returned in list responses (no overrides). */
export const EventSchema = z.object(eventBaseShape).openapi("Event");

/** Event as returned in single-event GET (includes overrides array). */
export const EventDetailSchema = z
    .object({ ...eventBaseShape, overrides: z.array(OccurrenceOverrideSchema) })
    .openapi("EventDetail");

// ─── Occurrence (expanded) schema ────────────────────────────────────────────

export const OccurrenceSchema = z
    .object({
        id: z.string().openapi({ example: "550e8400-...:2025-06-08" }),
        eventId: z.string().uuid(),
        occurrenceDate: z.string().openapi({ example: "2025-06-08" }),
        summary: z.string(),
        description: z.string().nullable(),
        url: z.string().nullable(),
        location: z.string().nullable(),
        dtstart: z.string().datetime(),
        dtend: z.string().datetime().nullable(),
        allDay: z.boolean(),
        status: ICalStatusSchema,
        isDraft: z.boolean(),
        isOverridden: z.boolean(),
        isRecurring: z.boolean(),
        notes: z.string().nullable(),
    })
    .openapi("Occurrence");

// ─── Space / EventType response schemas ──────────────────────────────────────

export const SpaceSchema = z
    .object({
        id: z.string().uuid(),
        slug: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        isPublic: z.boolean(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
    })
    .openapi("Space");

export const EventTypeSchema = z
    .object({
        id: z.string().uuid(),
        slug: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        color: z.string().nullable(),
        isInternal: z.boolean(),
        defaultDurationMinutes: z.number().int().nullable(),
        spaceId: z.string().uuid().nullable(),
        space: SpaceSummarySchema.nullable().optional(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
    })
    .openapi("EventType");

// ─── Request body schemas ─────────────────────────────────────────────────────

export const CreateEventSchema = z
    .object({
        spaceId: z.string().uuid(),
        eventTypeId: z.string().uuid(),
        summary: z
            .string()
            .min(1)
            .max(255)
            .openapi({ example: "Team Meeting" }),
        description: z.string().optional(),
        url: z.string().url().max(1000).optional(),
        location: z.string().max(500).optional(),
        dtstart: z.string().datetime(),
        dtend: z.string().datetime().optional(),
        allDay: z.boolean().default(false),
        rrule: z
            .string()
            .optional()
            .openapi({ example: "FREQ=WEEKLY;BYDAY=WE" }),
        recurrenceEndDate: z.string().datetime().optional(),
        frequencyLabel: z.string().max(255).optional(),
        status: ICalStatusSchema.default("confirmed"),
        isDraft: z.boolean().default(true),
    })
    .openapi("CreateEventRequest");

export const UpdateEventSchema = z
    .object({
        eventTypeId: z.string().uuid().optional(),
        summary: z.string().min(1).max(255).optional(),
        description: z.string().optional().nullable(),
        url: z.string().url().max(1000).optional().nullable(),
        location: z.string().max(500).optional().nullable(),
        dtstart: z.string().datetime().optional(),
        dtend: z.string().datetime().optional().nullable(),
        allDay: z.boolean().optional(),
        rrule: z.string().optional().nullable(),
        recurrenceEndDate: z.string().datetime().optional().nullable(),
        frequencyLabel: z.string().max(255).optional().nullable(),
        status: ICalStatusSchema.optional(),
        isDraft: z.boolean().optional(),
    })
    .openapi("UpdateEventRequest");

export const UpsertOverrideSchema = z
    .object({
        status: ICalStatusSchema.optional(),
        notes: z.string().optional(),
        summary: z.string().max(255).optional(),
        description: z.string().optional(),
        url: z.string().url().max(1000).optional(),
        location: z.string().max(500).optional(),
        dtstart: z.string().datetime().optional(),
        dtend: z.string().datetime().optional(),
    })
    .openapi("UpsertOverrideRequest");

// ─── Error schema ─────────────────────────────────────────────────────────────

export const ErrorSchema = z
    .object({ error: z.string() })
    .openapi("ErrorResponse");
