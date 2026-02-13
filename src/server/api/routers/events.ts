import { TRPCError } from "@trpc/server";
import { and, eq, gte } from "drizzle-orm";
import { RRule } from "rrule";
import { z } from "zod";

import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import {
	event,
	eventType,
	occurrenceOverride,
	space,
} from "@/server/db/schema";
import { hasPermission } from "@/server/permissions";

// Helper to check event permission and throw if denied
async function requireEventPermission(
	userId: string,
	spaceSlug: string,
	eventTypeSlug: string,
): Promise<void> {
	const allowed = await hasPermission(userId, { spaceSlug, eventTypeSlug });
	if (!allowed) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"You don't have permission to manage events in this space/event-type",
		});
	}
}

// Status values aligned with Model.md
const eventStatusSchema = z.enum([
	"pending",
	"tentative",
	"confirmed",
	"cancelled",
]);
const occurrenceStatusSchema = z.enum([
	"pending",
	"tentative",
	"confirmed",
	"cancelled",
	"gone", // Marks occurrence as deleted
]);

// Helper to format a Date as YYYY-MM-DD for occurrence identification
function formatOccurrenceDate(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export const eventsRouter = createTRPCRouter({
	list: publicProcedure
		.input(
			z.object({
				spaceId: z.string().uuid().optional(),
				eventTypeId: z.string().uuid().optional(),
				status: eventStatusSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const conditions = [];

			if (input.spaceId) {
				conditions.push(eq(event.spaceId, input.spaceId));
			}
			if (input.eventTypeId) {
				conditions.push(eq(event.eventTypeId, input.eventTypeId));
			}
			if (input.status) {
				conditions.push(eq(event.status, input.status));
			}

			return ctx.db.query.event.findMany({
				where: conditions.length > 0 ? and(...conditions) : undefined,
				with: {
					space: true,
					eventType: true,
					overrides: true,
				},
				orderBy: (events, { asc }) => [asc(events.startTime)],
			});
		}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			return ctx.db.query.event.findFirst({
				where: eq(event.id, input.id),
				with: {
					space: true,
					eventType: true,
					createdBy: true,
					overrides: true,
				},
			});
		}),

	// Get expanded occurrences for a date range
	// Occurrences are virtual objects with stable IDs: {eventId}:{index}
	getOccurrences: publicProcedure
		.input(
			z.object({
				spaceId: z.string().uuid().optional(),
				eventTypeId: z.string().uuid().optional(),
				includeGone: z.boolean().optional().default(false), // Include "gone" occurrences
				start: z.date(),
				end: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const isLoggedIn = !!ctx.session?.user;
			const conditions = [];

			if (input.spaceId) {
				conditions.push(eq(event.spaceId, input.spaceId));
			}
			if (input.eventTypeId) {
				conditions.push(eq(event.eventTypeId, input.eventTypeId));
			}

			const events = await ctx.db.query.event.findMany({
				where: conditions.length > 0 ? and(...conditions) : undefined,
				with: {
					space: true,
					eventType: true,
					overrides: true,
				},
			});

			// Expand occurrences
			type OccurrenceData = {
				id: string; // Stable ID: {eventId}:{YYYY-MM-DD}
				eventId: string;
				occurrenceDate: string; // YYYY-MM-DD
				title: string;
				description: string | null;
				url: string | null;
				location: string | null;
				start: Date;
				end: Date | null;
				allDay: boolean;
				isOverridden: boolean;
				isGone: boolean;
				isInternal: boolean;
				status: "pending" | "tentative" | "confirmed" | "cancelled" | "gone";
				notes: string | null;
				space: (typeof events)[0]["space"];
				eventType: (typeof events)[0]["eventType"];
				color: string | null;
				isRecurring: boolean;
				rrule: string | null;
			};

			const occurrences: OccurrenceData[] = [];

			for (const evt of events) {
				const defaultDurationMs = evt.eventType?.defaultDurationMinutes
					? evt.eventType.defaultDurationMinutes * 60_000
					: 0;
				const duration = evt.endTime
					? evt.endTime.getTime() - evt.startTime.getTime()
					: defaultDurationMs;

				if (!evt.isRecurring || !evt.rrule) {
					// Single event - use the event's start date as occurrence date
					const occDate = formatOccurrenceDate(evt.startTime);
					const override = evt.overrides.find(
						(o) => o.occurrenceDate === occDate,
					);
					const status = override?.status ?? evt.status;
					const isInternal = evt.eventType?.isInternal ?? false;

					// Skip "gone" occurrences unless explicitly requested
					if (status === "gone" && !input.includeGone) continue;

					// Hide pending/internal events from anonymous users
					if ((status === "pending" || isInternal) && !isLoggedIn) continue;

					// Check if within date range
					const start = override?.startTime ?? evt.startTime;
					if (start < input.start || start > input.end) continue;

					occurrences.push({
						id: `${evt.id}:${occDate}`,
						eventId: evt.id,
						occurrenceDate: occDate,
						title: override?.title ?? evt.title,
						description: override?.description ?? evt.description,
						url: override?.url ?? evt.url,
						location: override?.location ?? evt.location,
						start,
						end:
							override?.endTime ??
							evt.endTime ??
							(defaultDurationMs
								? new Date(start.getTime() + defaultDurationMs)
								: null),
						allDay: evt.allDay,
						isOverridden: !!override,
						isGone: status === "gone",
						isInternal,
						status,
						notes: override?.notes ?? null,
						space: evt.space,
						eventType: evt.eventType,
						color: evt.eventType?.color ?? null,
						isRecurring: false,
						rrule: null,
					});
				} else {
					// Recurring event - expand using RRULE
					try {
						// Parse the RRULE and set dtstart from the event's startTime
						const baseRule = RRule.fromString(evt.rrule);
						const rule = new RRule({
							...baseRule.origOptions,
							dtstart: evt.startTime,
						});

						// Get all dates, applying recurrence end date if set
						const endDate = evt.recurrenceEndDate
							? new Date(
									Math.min(
										evt.recurrenceEndDate.getTime(),
										input.end.getTime(),
									),
								)
							: input.end;

						// Use a slightly earlier start to ensure first occurrence is included
						// RRule.between can sometimes exclude the exact dtstart
						const queryStart = new Date(
							Math.min(evt.startTime.getTime(), input.start.getTime()) - 1000,
						);

						const allDates = rule.between(queryStart, endDate, true);

						// Filter to requested range and create occurrences with date-based ID
						for (const date of allDates) {
							const occDate = formatOccurrenceDate(date);

							// Get override for this date
							const override = evt.overrides.find(
								(o) => o.occurrenceDate === occDate,
							);

							const status = override?.status ?? evt.status;
							const isInternal = evt.eventType?.isInternal ?? false;

							// Skip "gone" occurrences unless explicitly requested
							if (status === "gone" && !input.includeGone) continue;

							// Hide pending/internal events from anonymous users
							if ((status === "pending" || isInternal) && !isLoggedIn) continue;

							// Calculate actual start/end times
							const start = override?.startTime ?? date;
							const end =
								override?.endTime ??
								(duration > 0 ? new Date(date.getTime() + duration) : null);

							// Check if within requested date range
							if (start < input.start || start > input.end) continue;

							occurrences.push({
								id: `${evt.id}:${occDate}`,
								eventId: evt.id,
								occurrenceDate: occDate,
								title: override?.title ?? evt.title,
								description: override?.description ?? evt.description,
								url: override?.url ?? evt.url,
								location: override?.location ?? evt.location,
								start,
								end,
								allDay: evt.allDay,
								isOverridden: !!override,
								isGone: status === "gone",
								isInternal,
								status,
								notes: override?.notes ?? null,
								space: evt.space,
								eventType: evt.eventType,
								color: evt.eventType?.color ?? null,
								isRecurring: true,
								rrule: evt.rrule,
							});
						}
					} catch (e) {
						console.error(`Failed to parse RRULE for event ${evt.id}:`, e);
					}
				}
			}

			// Sort by start time
			occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());

			return occurrences;
		}),

	create: protectedProcedure
		.input(
			z.object({
				spaceId: z.string().uuid(),
				eventTypeId: z.string().uuid(),
				title: z.string().min(1).max(255),
				description: z.string().optional(),
				url: z.string().url().max(1000).optional(),
				location: z.string().max(500).optional(),
				startTime: z.date(),
				endTime: z.date().optional(),
				timezone: z.string().default("UTC"),
				allDay: z.boolean().default(false),
				rrule: z.string().optional(),
				recurrenceEndDate: z.date().optional(),
				frequencyLabel: z.string().max(255).optional(),
				status: eventStatusSchema.default("pending"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get slugs for permission check
			const spaceRecord = await ctx.db.query.space.findFirst({
				where: eq(space.id, input.spaceId),
			});
			const eventTypeRecord = await ctx.db.query.eventType.findFirst({
				where: eq(eventType.id, input.eventTypeId),
			});

			if (!spaceRecord || !eventTypeRecord) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Space or event type not found",
				});
			}

			await requireEventPermission(
				ctx.session.user.id,
				spaceRecord.slug,
				eventTypeRecord.slug,
			);

			const [result] = await ctx.db
				.insert(event)
				.values({
					...input,
					createdById: ctx.session.user.id,
					isRecurring: !!input.rrule,
				})
				.returning();
			return result;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				eventTypeId: z.string().uuid().optional(),
				title: z.string().min(1).max(255).optional(),
				description: z.string().optional(),
				url: z.string().url().max(1000).optional(),
				location: z.string().max(500).optional().nullable(),
				startTime: z.date().optional(),
				endTime: z.date().optional(),
				timezone: z.string().optional(),
				allDay: z.boolean().optional(),
				rrule: z.string().optional().nullable(),
				recurrenceEndDate: z.date().optional().nullable(),
				frequencyLabel: z.string().max(255).optional().nullable(),
				status: eventStatusSchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existingEvent = await ctx.db.query.event.findFirst({
				where: eq(event.id, input.id),
				with: { space: true, eventType: true },
			});
			if (!existingEvent) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			await requireEventPermission(
				ctx.session.user.id,
				existingEvent.space.slug,
				existingEvent.eventType.slug,
			);

			const { id, rrule, ...updates } = input;
			const [result] = await ctx.db
				.update(event)
				.set({
					...updates,
					rrule: rrule ?? undefined,
					isRecurring: rrule !== undefined ? !!rrule : undefined,
					updatedAt: new Date(),
				})
				.where(eq(event.id, id))
				.returning();
			return result;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const existingEvent = await ctx.db.query.event.findFirst({
				where: eq(event.id, input.id),
				with: { space: true, eventType: true },
			});
			if (!existingEvent) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			await requireEventPermission(
				ctx.session.user.id,
				existingEvent.space.slug,
				existingEvent.eventType.slug,
			);

			await ctx.db.delete(event).where(eq(event.id, input.id));
			return { success: true };
		}),

	// =========================================================================
	// Occurrence Override Management
	// =========================================================================

	// Set/update an override for a specific occurrence
	upsertOverride: protectedProcedure
		.input(
			z.object({
				eventId: z.string().uuid(),
				occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				status: occurrenceStatusSchema.optional(),
				notes: z.string().optional(),
				title: z.string().max(255).optional(),
				description: z.string().optional(),
				url: z.string().url().max(1000).optional(),
				location: z.string().max(500).optional(),
				startTime: z.date().optional(),
				endTime: z.date().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { eventId, occurrenceDate, ...overrideData } = input;

			// Fetch the parent event to check permissions
			const parentEvent = await ctx.db.query.event.findFirst({
				where: eq(event.id, eventId),
				with: { space: true, eventType: true },
			});
			if (!parentEvent) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			await requireEventPermission(
				ctx.session.user.id,
				parentEvent.space.slug,
				parentEvent.eventType.slug,
			);

			// Check if override exists
			const existing = await ctx.db.query.occurrenceOverride.findFirst({
				where: and(
					eq(occurrenceOverride.eventId, eventId),
					eq(occurrenceOverride.occurrenceDate, occurrenceDate),
				),
			});

			if (existing) {
				// Update existing
				const [result] = await ctx.db
					.update(occurrenceOverride)
					.set({
						...overrideData,
						updatedAt: new Date(),
					})
					.where(eq(occurrenceOverride.id, existing.id))
					.returning();
				return result;
			}

			// Create new
			const [result] = await ctx.db
				.insert(occurrenceOverride)
				.values({
					eventId,
					occurrenceDate,
					...overrideData,
				})
				.returning();
			return result;
		}),

	// Mark an occurrence as "gone" (deleted)
	deleteOccurrence: protectedProcedure
		.input(
			z.object({
				eventId: z.string().uuid(),
				occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { eventId, occurrenceDate } = input;

			// For single events, delete the whole event
			const evt = await ctx.db.query.event.findFirst({
				where: eq(event.id, eventId),
				with: { space: true, eventType: true },
			});

			if (!evt) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			await requireEventPermission(
				ctx.session.user.id,
				evt.space.slug,
				evt.eventType.slug,
			);

			if (!evt.isRecurring) {
				// Delete the entire event
				await ctx.db.delete(event).where(eq(event.id, eventId));
				return { success: true, deleted: "event" };
			}

			// For recurring events, mark this occurrence as "gone"
			const existing = await ctx.db.query.occurrenceOverride.findFirst({
				where: and(
					eq(occurrenceOverride.eventId, eventId),
					eq(occurrenceOverride.occurrenceDate, occurrenceDate),
				),
			});

			if (existing) {
				await ctx.db
					.update(occurrenceOverride)
					.set({ status: "gone", updatedAt: new Date() })
					.where(eq(occurrenceOverride.id, existing.id));
			} else {
				await ctx.db.insert(occurrenceOverride).values({
					eventId,
					occurrenceDate,
					status: "gone",
				});
			}

			return { success: true, deleted: "occurrence" };
		}),

	// Remove an override (revert to inherited values)
	removeOverride: protectedProcedure
		.input(
			z.object({
				eventId: z.string().uuid(),
				occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const parentEvent = await ctx.db.query.event.findFirst({
				where: eq(event.id, input.eventId),
				with: { space: true, eventType: true },
			});
			if (!parentEvent) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			await requireEventPermission(
				ctx.session.user.id,
				parentEvent.space.slug,
				parentEvent.eventType.slug,
			);

			await ctx.db
				.delete(occurrenceOverride)
				.where(
					and(
						eq(occurrenceOverride.eventId, input.eventId),
						eq(occurrenceOverride.occurrenceDate, input.occurrenceDate),
					),
				);
			return { success: true };
		}),

	// =========================================================================
	// Series Editing (Split Logic)
	// =========================================================================

	// Edit a series from a specific point - creates a new series for future occurrences
	// The original series gets an end date, new series starts from splitDate
	editSeriesFromDate: protectedProcedure
		.input(
			z.object({
				eventId: z.string().uuid(),
				splitDate: z.date(), // Date from which to split
				// New values for future occurrences (null = keep same)
				title: z.string().min(1).max(255).optional(),
				description: z.string().optional(),
				url: z.string().url().max(1000).optional(),
				location: z.string().max(500).optional(),
				startTime: z.date().optional(), // New time-of-day (date part ignored for recurring)
				endTime: z.date().optional(),
				status: eventStatusSchema.optional(),
				rrule: z.string().optional(), // New RRULE (if changing recurrence pattern)
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { eventId, splitDate, ...updates } = input;

			const evt = await ctx.db.query.event.findFirst({
				where: eq(event.id, eventId),
				with: { overrides: true, space: true, eventType: true },
			});

			if (!evt) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			await requireEventPermission(
				ctx.session.user.id,
				evt.space.slug,
				evt.eventType.slug,
			);

			if (!evt.isRecurring || !evt.rrule) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot split a non-recurring event",
				});
			}

			// Parse the RRULE to find occurrences (set dtstart from event's startTime)
			const baseRule = RRule.fromString(evt.rrule);
			const rule = new RRule({
				...baseRule.origOptions,
				dtstart: evt.startTime,
			});
			const farFuture = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
			const allDates = rule.between(evt.startTime, farFuture, true);

			// Find the split point index
			const splitIndex = allDates.findIndex((d) => d >= splitDate);

			if (splitIndex === -1) {
				// All occurrences are before split date - no changes needed
				return { result: "no_future_occurrences", originalEvent: evt };
			}

			if (splitIndex === 0) {
				// All occurrences are after split date - just update the existing event
				const [result] = await ctx.db
					.update(event)
					.set({
						title: updates.title ?? evt.title,
						description: updates.description ?? evt.description,
						url: updates.url ?? evt.url,
						location: updates.location ?? evt.location,
						status: updates.status ?? evt.status,
						updatedAt: new Date(),
					})
					.where(eq(event.id, eventId))
					.returning();

				return { result: "updated_existing", originalEvent: result };
			}

			// We have occurrences both before and after the split date
			// 1. Set end date on original series (day before split)
			const lastOldOccurrence = allDates[splitIndex - 1];
			const firstNewOccurrence = allDates[splitIndex];

			if (!lastOldOccurrence || !firstNewOccurrence) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to calculate split dates",
				});
			}

			await ctx.db
				.update(event)
				.set({
					recurrenceEndDate: new Date(
						lastOldOccurrence.getTime() + 24 * 60 * 60 * 1000,
					),
					updatedAt: new Date(),
				})
				.where(eq(event.id, eventId));

			// 2. Create new series starting from split date

			// Adjust start time if provided (keep date from first occurrence, use time from input)
			let newStartTime = firstNewOccurrence;
			if (updates.startTime) {
				newStartTime = new Date(firstNewOccurrence);
				newStartTime.setHours(
					updates.startTime.getHours(),
					updates.startTime.getMinutes(),
					updates.startTime.getSeconds(),
				);
			}

			// Calculate new end time
			let newEndTime: Date | null = null;
			if (updates.endTime) {
				newEndTime = new Date(firstNewOccurrence);
				newEndTime.setHours(
					updates.endTime.getHours(),
					updates.endTime.getMinutes(),
					updates.endTime.getSeconds(),
				);
			} else if (evt.endTime) {
				const duration = evt.endTime.getTime() - evt.startTime.getTime();
				newEndTime = new Date(newStartTime.getTime() + duration);
			}

			const [newEvent] = await ctx.db
				.insert(event)
				.values({
					spaceId: evt.spaceId,
					eventTypeId: evt.eventTypeId,
					createdById: ctx.session.user.id,
					title: updates.title ?? evt.title,
					description: updates.description ?? evt.description,
					url: updates.url ?? evt.url,
					location: updates.location ?? evt.location,
					startTime: newStartTime,
					endTime: newEndTime,
					timezone: evt.timezone,
					allDay: evt.allDay,
					rrule: updates.rrule ?? evt.rrule,
					isRecurring: true,
					recurrenceEndDate: evt.recurrenceEndDate,
					status: updates.status ?? evt.status,
				})
				.returning();

			// 3. Migrate overrides from old series to new series for dates >= splitDate
			const splitDateStr = formatOccurrenceDate(splitDate);
			const overridesToMigrate = evt.overrides.filter(
				(o) => o.occurrenceDate >= splitDateStr,
			);

			if (overridesToMigrate.length > 0 && newEvent) {
				// Delete old overrides that are being migrated
				await ctx.db
					.delete(occurrenceOverride)
					.where(
						and(
							eq(occurrenceOverride.eventId, eventId),
							gte(occurrenceOverride.occurrenceDate, splitDateStr),
						),
					);

				// Insert them for the new event
				await ctx.db.insert(occurrenceOverride).values(
					overridesToMigrate.map((o) => ({
						eventId: newEvent.id,
						occurrenceDate: o.occurrenceDate,
						status: o.status,
						notes: o.notes,
						title: o.title,
						description: o.description,
						url: o.url,
						location: o.location,
						startTime: o.startTime,
						endTime: o.endTime,
					})),
				);
			}

			return {
				result: "split",
				originalEvent: evt,
				newEvent,
				splitAtDate: splitDateStr,
				migratedOverrides: overridesToMigrate.length,
			};
		}),
});
