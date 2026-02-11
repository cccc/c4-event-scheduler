export type EventStatus = "pending" | "tentative" | "confirmed" | "cancelled";
export type OccurrenceStatus = EventStatus | "gone";

export type Occurrence = {
	id: string; // Stable ID: {eventId}:{YYYY-MM-DD}
	eventId: string;
	occurrenceDate: string; // YYYY-MM-DD
	title: string;
	description: string | null;
	url: string | null;
	start: Date;
	end: Date | null;
	allDay: boolean;
	isOverridden: boolean;
	isGone: boolean;
	status: OccurrenceStatus;
	notes: string | null;
	space: { id: string; name: string };
	eventType: { id: string; name: string; color: string | null } | null;
	color: string | null;
	isRecurring: boolean;
	rrule: string | null;
};

export type Space = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	isPublic: boolean;
};

export type EventType = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	color: string | null;
	spaceId: string | null;
};
