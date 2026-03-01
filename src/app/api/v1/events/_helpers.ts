import type { z } from "zod";

import { env } from "@/env";
import type { CreateEventSchema } from "@/lib/api-v1/schemas";

/**
 * Builds the Drizzle insert/update values from a validated CreateEventSchema
 * payload. Does not include `id` — callers add it when needed.
 */
export function buildEventInsertValues(
    input: z.infer<typeof CreateEventSchema>,
    actorId: string | undefined,
) {
    return {
        spaceId: input.spaceId,
        eventTypeId: input.eventTypeId,
        summary: input.summary,
        description: input.description,
        url: input.url,
        location: input.location,
        dtstart: new Date(input.dtstart),
        dtend: input.dtend ? new Date(input.dtend) : undefined,
        timezone: env.NEXT_PUBLIC_APP_TIMEZONE,
        allDay: input.allDay,
        rrule: input.rrule,
        recurrenceEndDate: input.recurrenceEndDate
            ? new Date(input.recurrenceEndDate)
            : undefined,
        frequencyLabel: input.frequencyLabel,
        status: input.status,
        isDraft: input.isDraft,
        createdByActorId: actorId ?? null,
        updatedByActorId: actorId ?? null,
    };
}
