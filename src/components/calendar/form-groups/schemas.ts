import { z } from "zod";

// Zod shapes matching the field groups; forms compose them with z.object.

export const statusSchema = z.enum(["confirmed", "tentative", "cancelled"]);

export const eventBasicsShape = {
    summary: z.string().min(1, "Title is required"),
    description: z.string(),
    url: z.url("Must be a valid URL").or(z.literal("")),
    location: z.string(),
};

// Occurrence overrides: every field may be left empty to inherit
export const optionalEventBasicsShape = {
    ...eventBasicsShape,
    summary: z.string(),
};

export const eventTimeShape = {
    dtstart: z.string().min(1, "Start time is required"),
    dtend: z.string(),
    hasEndTime: z.boolean(),
};

export const optionalEventTimeShape = {
    ...eventTimeShape,
    dtstart: z.string(),
};

export const seriesScheduleShape = {
    seriesFirstDate: z.string().min(1, "First occurrence date is required"),
    seriesLastDate: z.string(),
    seriesHasEndDate: z.boolean(),
    occurrenceStartTime: z.string().min(1, "Start time is required"),
    occurrenceEndTime: z.string(),
    hasEndTime: z.boolean(),
};

export const eventStatusShape = {
    status: statusSchema,
    isDraft: z.boolean(),
};
