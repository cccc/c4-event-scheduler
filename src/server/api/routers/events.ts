import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { expandRruleInTimezone, formatOccurrenceDate } from "@/lib/rrule-utils";
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

// iCal STATUS values (shared by events and occurrence overrides)
const icalStatusSchema = z.enum(["tentative", "confirmed", "cancelled"]);

export const eventsRouter = createTRPCRouter({
	list: publicProcedure
		.input(
			z.object({
				spaceId: z.uuid().optional(),
				eventTypeId: z.uuid().optional(),
				status: icalStatusSchema.optional(),
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
				orderBy: (events, { asc }) => [asc(events.dtstart)],
			});
		}),

	getById: publicProcedure
		.input(z.object({ id: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const result = await ctx.db.query.event.findFirst({
				where: eq(event.id, input.id),
				with: {
					space: true,
					eventType: true,
					createdBy: true,
					updatedBy: true,
					createdByApiKey: true,
					updatedByApiKey: true,
					overrides: true,
				},
			});

			if (result && !ctx.session?.user) {
				result.createdBy = null;
				result.updatedBy = null;
				result.createdById = null;
				result.updatedById = null;
				result.createdByApiKey = null;
				result.updatedByApiKey = null;
				result.createdByApiKeyId = null;
				result.updatedByApiKeyId = null;
			}

			return result;
		}),

	// Get expanded occurrences for a date range
	// Occurrences are virtual objects with stable IDs: {eventId}:{YYYY-MM-DD}
	getOccurrences: publicProcedure
		.input(
			z.object({
				spaceId: z.uuid().optional(),
				eventTypeId: z.uuid().optional(),
				includeExdates: z.boolean().optional().default(false),
				start: z.date(),
				end: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const isLoggedIn = !!ctx.session?.user;
			const tz = env.NEXT_PUBLIC_APP_TIMEZONE;
			const conditions = [];

			if (input.spaceId) {
				conditions.push(eq(event.spaceId, input.spaceId));
			}
			if (input.eventTypeId) {
				conditions.push(eq(event.eventTypeId, input.eventTypeId));
			}

			// Pre-filter at the DB level: only fetch events whose active range
			// intersects the visible window (like an iCal client would)
			conditions.push(
				or(
					// Single events: dtstart must be within the range
					and(
						isNull(event.rrule),
						gte(event.dtstart, input.start),
						lte(event.dtstart, input.end),
					),
					// Recurring events: series must overlap the range
					and(
						isNotNull(event.rrule),
						lte(event.dtstart, input.end),
						or(
							isNull(event.recurrenceEndDate),
							gte(event.recurrenceEndDate, input.start),
						),
					),
				) as ReturnType<typeof eq>,
			);

			const events = await ctx.db.query.event.findMany({
				where: and(...conditions),
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
				summary: string;
				description: string | null;
				url: string | null;
				location: string | null;
				dtstart: Date;
				dtend: Date | null;
				allDay: boolean;
				isOverridden: boolean;
				isDraft: boolean;
				isInternal: boolean;
				status: "tentative" | "confirmed" | "cancelled";
				notes: string | null;
				space: (typeof events)[0]["space"];
				eventType: (typeof events)[0]["eventType"];
				color: string | null;
				isRecurring: boolean;
				rrule: string | null;
			};

			const occurrences: OccurrenceData[] = [];

			for (const evt of events) {
				// Hide draft events from anonymous users
				if (evt.isDraft && !isLoggedIn) continue;

				const isInternal = evt.eventType?.isInternal ?? false;
				const defaultDurationMs = evt.eventType?.defaultDurationMinutes
					? evt.eventType.defaultDurationMinutes * 60_000
					: 0;
				const duration = evt.dtend
					? evt.dtend.getTime() - evt.dtstart.getTime()
					: defaultDurationMs;

				// Parse exdates into a Set for fast lookup
				const exdatesSet = new Set(
					evt.exdates ? evt.exdates.split(",").map((d) => d.trim()) : [],
				);

				if (!evt.rrule) {
					// Single event - use the event's start date as occurrence date
					const occDate = formatOccurrenceDate(evt.dtstart, tz);
					const override = evt.overrides.find(
						(o) => o.occurrenceDate === occDate,
					);
					const status = override?.status ?? evt.status;

					// Hide internal events from anonymous users
					if (isInternal && !isLoggedIn) continue;

					// Check if within date range
					const start = override?.dtstart ?? evt.dtstart;
					if (start < input.start || start > input.end) continue;

					occurrences.push({
						id: `${evt.id}:${occDate}`,
						eventId: evt.id,
						occurrenceDate: occDate,
						summary: override?.summary ?? evt.summary,
						description: override?.description ?? evt.description,
						url: override?.url ?? evt.url,
						location: override?.location ?? evt.location,
						dtstart: start,
						dtend:
							override?.dtend ??
							evt.dtend ??
							(defaultDurationMs
								? new Date(start.getTime() + defaultDurationMs)
								: null),
						allDay: evt.allDay,
						isOverridden: !!override,
						isDraft: evt.isDraft,
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
					// Recurring event - expand using RRULE with DST-aware timezone handling
					try {
						const endDate = evt.recurrenceEndDate
							? new Date(
									Math.min(
										evt.recurrenceEndDate.getTime(),
										input.end.getTime(),
									),
								)
							: input.end;

						const allDates = expandRruleInTimezone(
							evt.rrule,
							evt.dtstart,
							input.start,
							endDate,
							tz,
						);

						// Filter to requested range and create occurrences with date-based ID
						for (const date of allDates) {
							const occDate = formatOccurrenceDate(date, tz);

							// Skip exdates unless explicitly requested
							if (exdatesSet.has(occDate) && !input.includeExdates) continue;

							// Get override for this date
							const override = evt.overrides.find(
								(o) => o.occurrenceDate === occDate,
							);

							const status = override?.status ?? evt.status;

							// Hide internal events from anonymous users
							if (isInternal && !isLoggedIn) continue;

							// Calculate actual start/end times
							const start = override?.dtstart ?? date;
							const end =
								override?.dtend ??
								(duration > 0 ? new Date(date.getTime() + duration) : null);

							// Check if within requested date range
							if (start < input.start || start > input.end) continue;

							occurrences.push({
								id: `${evt.id}:${occDate}`,
								eventId: evt.id,
								occurrenceDate: occDate,
								summary: override?.summary ?? evt.summary,
								description: override?.description ?? evt.description,
								url: override?.url ?? evt.url,
								location: override?.location ?? evt.location,
								dtstart: start,
								dtend: end,
								allDay: evt.allDay,
								isOverridden: !!override,
								isDraft: evt.isDraft,
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
			occurrences.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());

			return occurrences;
		}),

	create: protectedProcedure
		.input(
			z.object({
				spaceId: z.uuid(),
				eventTypeId: z.uuid(),
				summary: z.string().min(1).max(255),
				description: z.string().optional(),
				url: z.url().max(1000).optional(),
				location: z.string().max(500).optional(),
				dtstart: z.date(),
				dtend: z.date().optional(),
				timezone: z.string().default("UTC"),
				allDay: z.boolean().default(false),
				rrule: z.string().optional(),
				recurrenceEndDate: z.date().optional(),
				frequencyLabel: z.string().max(255).optional(),
				status: icalStatusSchema.default("confirmed"),
				isDraft: z.boolean().default(true),
			}),
		)
		.mutation(async ({ ctx, input: { timezone: _timezone, ...input } }) => {
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
					timezone: env.NEXT_PUBLIC_APP_TIMEZONE,
					createdById: ctx.session.user.id,
				})
				.returning();
			return result;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.uuid(),
				eventTypeId: z.uuid().optional(),
				summary: z.string().min(1).max(255).optional(),
				description: z.string().optional(),
				url: z.url().max(1000).optional(),
				location: z.string().max(500).optional().nullable(),
				dtstart: z.date().optional(),
				dtend: z.date().optional(),
				timezone: z.string().optional(),
				allDay: z.boolean().optional(),
				rrule: z.string().optional().nullable(),
				recurrenceEndDate: z.date().optional().nullable(),
				frequencyLabel: z.string().max(255).optional().nullable(),
				status: icalStatusSchema.optional(),
				isDraft: z.boolean().optional(),
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
					sequence: existingEvent.sequence + 1,
					updatedAt: new Date(),
					updatedById: ctx.session.user.id,
					updatedByApiKeyId: null,
				})
				.where(eq(event.id, id))
				.returning();
			return result;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
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
				eventId: z.uuid(),
				occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				status: icalStatusSchema.optional(),
				notes: z.string().optional(),
				summary: z.string().max(255).optional(),
				description: z.string().optional(),
				url: z.url().max(1000).optional(),
				location: z.string().max(500).optional(),
				dtstart: z.date().optional(),
				dtend: z.date().optional(),
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

			// Bump parent event's sequence for iCal client update detection
			await ctx.db
				.update(event)
				.set({
					sequence: parentEvent.sequence + 1,
					updatedAt: new Date(),
					updatedById: ctx.session.user.id,
					updatedByApiKeyId: null,
				})
				.where(eq(event.id, eventId));

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

	// Delete an occurrence (adds to exdates for recurring, deletes event for single)
	deleteOccurrence: protectedProcedure
		.input(
			z.object({
				eventId: z.uuid(),
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

			if (!evt.rrule) {
				// Delete the entire event
				await ctx.db.delete(event).where(eq(event.id, eventId));
				return { success: true, deleted: "event" };
			}

			// For recurring events, add date to exdates and remove any override
			const existingExdates = evt.exdates
				? evt.exdates.split(",").map((d) => d.trim())
				: [];
			if (!existingExdates.includes(occurrenceDate)) {
				existingExdates.push(occurrenceDate);
			}

			await ctx.db
				.update(event)
				.set({
					exdates: existingExdates.join(","),
					sequence: evt.sequence + 1,
					updatedAt: new Date(),
					updatedById: ctx.session.user.id,
					updatedByApiKeyId: null,
				})
				.where(eq(event.id, eventId));

			// Delete any existing override for this date
			await ctx.db
				.delete(occurrenceOverride)
				.where(
					and(
						eq(occurrenceOverride.eventId, eventId),
						eq(occurrenceOverride.occurrenceDate, occurrenceDate),
					),
				);

			return { success: true, deleted: "occurrence" };
		}),

	// Remove an override (revert to inherited values)
	removeOverride: protectedProcedure
		.input(
			z.object({
				eventId: z.uuid(),
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
				eventId: z.uuid(),
				splitDate: z.date(), // Date from which to split
				// New values for future occurrences (null = keep same)
				summary: z.string().min(1).max(255).optional(),
				description: z.string().optional(),
				url: z.url().max(1000).optional(),
				location: z.string().max(500).optional(),
				dtstart: z.date().optional(), // New time-of-day (date part ignored for recurring)
				dtend: z.date().optional(),
				status: icalStatusSchema.optional(),
				rrule: z.string().optional(), // New RRULE (if changing recurrence pattern)
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { eventId, splitDate, ...updates } = input;
			const tz = env.NEXT_PUBLIC_APP_TIMEZONE;

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

			if (!evt.rrule) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot split a non-recurring event",
				});
			}

			const farFuture = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
			const allDates = expandRruleInTimezone(
				evt.rrule,
				evt.dtstart,
				evt.dtstart,
				farFuture,
				tz,
			);

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
						summary: updates.summary ?? evt.summary,
						description: updates.description ?? evt.description,
						url: updates.url ?? evt.url,
						location: updates.location ?? evt.location,
						status: updates.status ?? evt.status,
						sequence: evt.sequence + 1,
						updatedAt: new Date(),
						updatedById: ctx.session.user.id,
						updatedByApiKeyId: null,
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

			// Split exdates between old and new series
			const splitDateStr = formatOccurrenceDate(splitDate, tz);
			const oldExdates: string[] = [];
			const newExdates: string[] = [];
			if (evt.exdates) {
				for (const d of evt.exdates.split(",").map((s) => s.trim())) {
					if (d < splitDateStr) {
						oldExdates.push(d);
					} else {
						newExdates.push(d);
					}
				}
			}

			await ctx.db
				.update(event)
				.set({
					recurrenceEndDate: new Date(
						lastOldOccurrence.getTime() + 24 * 60 * 60 * 1000,
					),
					exdates: oldExdates.length > 0 ? oldExdates.join(",") : null,
					sequence: evt.sequence + 1,
					updatedAt: new Date(),
					updatedById: ctx.session.user.id,
					updatedByApiKeyId: null,
				})
				.where(eq(event.id, eventId));

			// 2. Create new series starting from split date

			// Adjust start time if provided (keep date from first occurrence, use time from input)
			let newDtstart = firstNewOccurrence;
			if (updates.dtstart) {
				newDtstart = new Date(firstNewOccurrence);
				newDtstart.setHours(
					updates.dtstart.getHours(),
					updates.dtstart.getMinutes(),
					updates.dtstart.getSeconds(),
				);
			}

			// Calculate new end time
			let newDtend: Date | null = null;
			if (updates.dtend) {
				newDtend = new Date(firstNewOccurrence);
				newDtend.setHours(
					updates.dtend.getHours(),
					updates.dtend.getMinutes(),
					updates.dtend.getSeconds(),
				);
			} else if (evt.dtend) {
				const duration = evt.dtend.getTime() - evt.dtstart.getTime();
				newDtend = new Date(newDtstart.getTime() + duration);
			}

			const [newEvent] = await ctx.db
				.insert(event)
				.values({
					spaceId: evt.spaceId,
					eventTypeId: evt.eventTypeId,
					createdById: ctx.session.user.id,
					updatedById: ctx.session.user.id,
					summary: updates.summary ?? evt.summary,
					description: updates.description ?? evt.description,
					url: updates.url ?? evt.url,
					location: updates.location ?? evt.location,
					dtstart: newDtstart,
					dtend: newDtend,
					timezone: evt.timezone,
					allDay: evt.allDay,
					rrule: updates.rrule ?? evt.rrule,
					recurrenceEndDate: evt.recurrenceEndDate,
					exdates: newExdates.length > 0 ? newExdates.join(",") : null,
					status: updates.status ?? evt.status,
					isDraft: evt.isDraft,
				})
				.returning();

			// 3. Migrate overrides from old series to new series for dates >= splitDate
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
						summary: o.summary,
						description: o.description,
						url: o.url,
						location: o.location,
						dtstart: o.dtstart,
						dtend: o.dtend,
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
