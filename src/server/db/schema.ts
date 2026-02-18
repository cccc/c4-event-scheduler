import { relations } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	pgEnum,
	pgTableCreator,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * Multi-project schema pattern using a prefix.
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `c4_${name}`);

// ============================================================================
// Enums
// ============================================================================

// iCal STATUS values (RFC 5545) — used by both events and occurrence overrides
// tentative = shown but not confirmed
// confirmed = definitely happening
// cancelled = was planned but no longer happening (shown with strikethrough)
export const icalStatusEnum = pgEnum("c4_ical_status", [
	"tentative",
	"confirmed",
	"cancelled",
]);

// ============================================================================
// Auth tables (managed by BetterAuth)
// ============================================================================

export const user = createTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	isAdmin: boolean("is_admin").notNull().default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = createTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = createTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = createTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

// ============================================================================
// Space - Calendar container
// ============================================================================

export const space = createTable(
	"space",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		slug: varchar("slug", { length: 100 }).notNull().unique(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		isPublic: boolean("is_public").notNull().default(true),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [index("space_slug_idx").on(table.slug)],
);

export const spaceRelations = relations(space, ({ many }) => ({
	events: many(event),
	eventTypes: many(eventType),
}));

// ============================================================================
// EventType - Shared event templates
// ============================================================================

export const eventType = createTable(
	"event_type",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		slug: varchar("slug", { length: 100 }).notNull().unique(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		color: varchar("color", { length: 20 }),
		isInternal: boolean("is_internal").notNull().default(false),
		defaultDurationMinutes: integer("default_duration_minutes"),
		// If null, event type is global (available in all spaces)
		// If set, event type is specific to this space only
		spaceId: uuid("space_id").references(() => space.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("event_type_slug_idx").on(table.slug),
		index("event_type_space_idx").on(table.spaceId),
	],
);

export const eventTypeRelations = relations(eventType, ({ one, many }) => ({
	events: many(event),
	space: one(space, {
		fields: [eventType.spaceId],
		references: [space.id],
	}),
}));

// ============================================================================
// Event - Master event/series definition
// ============================================================================

export const event = createTable(
	"event",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		spaceId: uuid("space_id")
			.notNull()
			.references(() => space.id, { onDelete: "cascade" }),
		eventTypeId: uuid("event_type_id")
			.notNull()
			.references(() => eventType.id, { onDelete: "restrict" }),
		createdById: text("created_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		updatedById: text("updated_by_id").references(() => user.id, {
			onDelete: "set null",
		}),

		// iCal VEVENT properties
		summary: varchar("summary", { length: 255 }).notNull(),
		description: text("description"),
		url: varchar("url", { length: 1000 }),
		location: varchar("location", { length: 500 }),

		// Timing (iCal DTSTART/DTEND)
		dtstart: timestamp("dtstart", { withTimezone: true }).notNull(),
		dtend: timestamp("dtend", { withTimezone: true }),
		timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
		allDay: boolean("all_day").notNull().default(false),

		// Recurrence (RFC 5545 RRULE)
		rrule: text("rrule"), // e.g., "FREQ=WEEKLY;BYDAY=TU"
		recurrenceEndDate: timestamp("recurrence_end_date", { withTimezone: true }),
		exdates: text("exdates"), // Comma-separated YYYY-MM-DD dates excluded from recurrence
		// Human-readable frequency label for recurring events (e.g., "Jeden Donnerstag (~19 Uhr)")
		frequencyLabel: varchar("frequency_label", { length: 255 }),

		// Status (iCal STATUS)
		status: icalStatusEnum("status").notNull().default("confirmed"),
		isDraft: boolean("is_draft").notNull().default(true),
		sequence: integer("sequence").notNull().default(0),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("event_space_idx").on(table.spaceId),
		index("event_start_idx").on(table.dtstart),
		index("event_status_idx").on(table.status),
	],
);

export const eventRelations = relations(event, ({ one, many }) => ({
	space: one(space, {
		fields: [event.spaceId],
		references: [space.id],
	}),
	eventType: one(eventType, {
		fields: [event.eventTypeId],
		references: [eventType.id],
	}),
	createdBy: one(user, {
		fields: [event.createdById],
		references: [user.id],
		relationName: "eventCreatedBy",
	}),
	updatedBy: one(user, {
		fields: [event.updatedById],
		references: [user.id],
		relationName: "eventUpdatedBy",
	}),
	overrides: many(occurrenceOverride),
}));

// ============================================================================
// OccurrenceOverride - Per-occurrence modifications for recurring events
// ============================================================================
// Occurrences are virtual objects generated from the event's RRULE.
// Each occurrence has a stable identifier: {eventId}:{YYYY-MM-DD}
// This table stores overrides for individual occurrences.

export const occurrenceOverride = createTable(
	"occurrence_override",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		eventId: uuid("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),

		// Occurrence date (YYYY-MM-DD, identifies which occurrence is overridden)
		// Date-based IDs are stable even when the series is modified
		occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),

		// Status override (null = inherit from event)
		status: icalStatusEnum("status"),

		// Notes/comments explaining the override (e.g., "Moved due to holiday")
		notes: text("notes"),

		// Override fields (null = inherit from event)
		summary: varchar("summary", { length: 255 }),
		description: text("description"),
		url: varchar("url", { length: 1000 }),
		location: varchar("location", { length: 500 }),
		dtstart: timestamp("dtstart", { withTimezone: true }),
		dtend: timestamp("dtend", { withTimezone: true }),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("occurrence_override_event_idx").on(table.eventId),
		index("occurrence_override_event_date_idx").on(
			table.eventId,
			table.occurrenceDate,
		),
	],
);

export const occurrenceOverrideRelations = relations(
	occurrenceOverride,
	({ one }) => ({
		event: one(event, {
			fields: [occurrenceOverride.eventId],
			references: [event.id],
		}),
	}),
);

// ============================================================================
// Permissions - Claim-based access control
// ============================================================================
// Permissions use slugs instead of UUIDs to allow:
// - Creating permissions before the space/event-type exists
// - Direct mapping from OIDC claims like "prefix:space:slug"
//
// Scope logic:
// - spaceSlug=null, eventTypeSlug=null → global access (all spaces/event-types)
// - spaceSlug="x", eventTypeSlug=null → access to space x and all its events
// - spaceSlug=null, eventTypeSlug="y" → access to event type y in all spaces
// - spaceSlug="x", eventTypeSlug="y" → access only to event type y in space x

export const permissionSourceEnum = pgEnum("c4_permission_source", [
	"oidc", // Synced from OIDC claims
	"manual", // Manually assigned via admin UI
]);

export const userPermission = createTable(
	"user_permission",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		spaceSlug: varchar("space_slug", { length: 100 }),
		eventTypeSlug: varchar("event_type_slug", { length: 100 }),
		source: permissionSourceEnum("source").notNull().default("manual"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("user_permission_user_idx").on(table.userId),
		index("user_permission_space_slug_idx").on(table.spaceSlug),
		index("user_permission_event_type_slug_idx").on(table.eventTypeSlug),
	],
);

export const userPermissionRelations = relations(userPermission, ({ one }) => ({
	user: one(user, {
		fields: [userPermission.userId],
		references: [user.id],
	}),
}));
