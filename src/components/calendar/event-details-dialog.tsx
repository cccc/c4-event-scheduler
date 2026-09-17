import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import {
    CalendarDays,
    Clock,
    ExternalLink,
    FileText,
    Info,
    Link2,
    MapPin,
    Repeat,
    Tag,
    User,
    X,
} from "lucide-react";
import { useState } from "react";
import { RRule } from "rrule";
import { CopyButton } from "@/components/copy-button";
import { useAppTimezone } from "@/components/timezone-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEventLink } from "@/lib/event-link";
import {
    formatDate,
    formatDateOnly,
    formatDateTime,
    formatDateTimeRange,
    formatTime,
} from "@/lib/format-date";
import { eventsKeys, eventsQueries } from "@/lib/queries/events";
import type { EditTab } from "@/lib/stores/calendar-dialog-store";
import {
    removeExdate as removeExdateFn,
    removeOverride as removeOverrideFn,
} from "@/server/fns/events";
import { effectiveEnd } from "./date-utils";
import type { EventStatus, Occurrence } from "./types";
import { spaceRoute } from "./use-calendar-deep-link";

type EventDetailsDialogProps = {
    canEdit: boolean;
    /** The linked occurrence (?event=); null closes the dialog */
    occurrence: Occurrence | null;
    /** Escape or a backdrop click; the close buttons are links instead */
    onClose: () => unknown;
    /** Leaves the details for the edit dialog */
    onEdit: (occurrence: Occurrence, editTab?: EditTab) => void;
};

function describeOverride(
    override: {
        occurrenceDate: string;
        status: string | null;
        summary: string | null;
        description: string | null;
        url: string | null;
        location: string | null;
        dtstart: Date | null;
        dtend: Date | null;
        notes: string | null;
    },
    tz: string,
): string {
    const changes: string[] = [];
    if (override.status) changes.push(`status: ${override.status}`);
    if (override.summary) changes.push("title changed");
    if (override.dtstart)
        changes.push(`time: ${formatTime(override.dtstart, tz)}`);
    if (override.location) changes.push("location changed");
    if (override.notes) changes.push(`note: ${override.notes}`);
    if (override.description) changes.push("description changed");
    if (override.url) changes.push("URL changed");
    return changes.length > 0 ? changes.join(", ") : "modified";
}

/**
 * Copies a deep link to this occurrence (calendar on its date, details open).
 * Confirms on the button itself: a toast would render under the modal's
 * backdrop, outside the top layer
 */
function CopyLinkButton({
    eventId,
    occurrenceDate,
}: {
    eventId: string;
    occurrenceDate: string;
}) {
    const { appUrl } = useRouteContext({ from: "__root__" });
    const { slug } = spaceRoute.useParams();
    const params = new URLSearchParams({
        event: formatEventLink(eventId, occurrenceDate),
    });
    return (
        <CopyButton
            className="script-only mr-auto"
            icon={Link2}
            label="Copy link"
            value={`${appUrl}/spaces/${slug}?${params}`}
            variant="ghost"
        />
    );
}

/**
 * Closes the details by dropping the link that keeps them open: a client
 * navigation in a view transition with scripts, a page load without
 */
function CloseLink(props: {
    children: React.ReactNode;
    "aria-label"?: string;
    className?: string;
}) {
    return (
        <Link
            from="/spaces/$slug"
            replace
            search={(prev) => ({ ...prev, event: undefined })}
            to="."
            viewTransition
            {...props}
        />
    );
}

function DetailsHeader({ occurrence }: { occurrence: Occurrence }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                <DialogTitle className="text-xl">
                    {occurrence.summary}
                </DialogTitle>
                <OccurrenceBadges occurrence={occurrence} />
            </div>
            <Button
                asChild
                className="-mt-2 -mr-2"
                size="icon-sm"
                variant="ghost"
            >
                <CloseLink aria-label="Close">
                    <X />
                </CloseLink>
            </Button>
        </div>
    );
}

function getStatusBadge(status: EventStatus, isDraft: boolean) {
    const badges = [];
    if (isDraft) {
        badges.push(
            <Badge key="draft" variant="outline">
                Draft
            </Badge>,
        );
    }
    switch (status) {
        case "confirmed":
            badges.push(
                <Badge key="status" variant="default">
                    Confirmed
                </Badge>,
            );
            break;
        case "tentative":
            badges.push(
                <Badge key="status" variant="secondary">
                    Tentative
                </Badge>,
            );
            break;
        case "cancelled":
            badges.push(
                <Badge key="status" variant="destructive">
                    Cancelled
                </Badge>,
            );
            break;
    }
    return badges;
}

/** Event type, status and visibility badges of an occurrence */
export function OccurrenceBadges({ occurrence }: { occurrence: Occurrence }) {
    return (
        <div className="flex items-center gap-2">
            {occurrence.eventType && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    {occurrence.eventType.color && (
                        <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                                backgroundColor: occurrence.eventType.color,
                            }}
                        />
                    )}
                    <span>{occurrence.eventType.name}</span>
                </div>
            )}
            {getStatusBadge(occurrence.status, occurrence.isDraft)}
            {occurrence.isInternal && <Badge variant="outline">Internal</Badge>}
        </div>
    );
}

type OccurrenceContentProps = {
    occurrence: Occurrence;
    canEdit: boolean;
    onEdit: () => void;
};

/** The body of the details: when, description, links, location, notes */
export function OccurrenceContent({
    occurrence,
    canEdit,
    onEdit,
}: OccurrenceContentProps) {
    const tz = useAppTimezone();

    // Fetch full event data for single events to show creator info
    const { data: eventData } = useQuery({
        ...eventsQueries.getById(occurrence.eventId),
        enabled: !occurrence.isRecurring,
    });

    const displayEnd = effectiveEnd(occurrence);
    // An end on a later day (in the app timezone) gets its own date line;
    // start and end clock times alone would read as one day. An end exactly
    // at the following midnight still counts as the same day (18:00 - 00:00)
    const endsOnLaterDay =
        !!displayEnd &&
        formatDate(new Date(displayEnd.getTime() - 1), tz) !==
            formatDate(occurrence.dtstart, tz);
    const displayLocation = occurrence.location ?? occurrence.space.name;
    const showSpaceSeparately =
        occurrence.location && occurrence.location !== occurrence.space.name;

    return (
        <>
            <div className="space-y-4">
                {/* Date & Time */}
                <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                        {displayEnd && endsOnLaterDay ? (
                            <div className="font-medium">
                                {occurrence.allDay
                                    ? `${formatDate(occurrence.dtstart, tz)} – ${formatDate(displayEnd, tz)}`
                                    : formatDateTimeRange(
                                          occurrence.dtstart,
                                          displayEnd,
                                          tz,
                                      )}
                            </div>
                        ) : (
                            <>
                                <div className="font-medium">
                                    {formatDate(occurrence.dtstart, tz)}
                                </div>
                                {!occurrence.allDay && (
                                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>
                                            {formatTime(occurrence.dtstart, tz)}
                                            {displayEnd &&
                                                ` – ${formatTime(displayEnd, tz)}`}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                        {occurrence.isRecurring && (
                            <div className="mt-1 text-muted-foreground text-sm">
                                Part of a recurring series
                            </div>
                        )}
                    </div>
                </div>

                {/* Description */}
                {occurrence.description && (
                    <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="whitespace-pre-wrap text-sm">
                            {occurrence.description}
                        </div>
                    </div>
                )}

                {/* URL */}
                {occurrence.url && (
                    <div className="flex items-start gap-3">
                        <ExternalLink className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <a
                            className="text-primary text-sm hover:underline"
                            href={occurrence.url}
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            {occurrence.url}
                        </a>
                    </div>
                )}

                {/* Location */}
                <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div className="text-sm">{displayLocation}</div>
                </div>

                {/* Space (shown separately if location differs) */}
                {showSpaceSeparately && (
                    <div className="flex items-start gap-3">
                        <Tag className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="text-sm">{occurrence.space.name}</div>
                    </div>
                )}

                {/* Notes (only shown if there are override notes) */}
                {occurrence.notes && (
                    <Alert role="note" variant="warning">
                        <AlertTitle>Note</AlertTitle>
                        <AlertDescription>{occurrence.notes}</AlertDescription>
                    </Alert>
                )}

                {/* Created/Updated by (single events only — recurring shows this in Series Info tab) */}
                {!occurrence.isRecurring &&
                    (() => {
                        const createdByLabel = eventData?.createdByActor
                            ? eventData.createdByActor.kind === "user"
                                ? (eventData.createdByActor.user?.name ?? null)
                                : `API: ${eventData.createdByActor.apiKey?.name ?? ""}`
                            : null;
                        const updatedByLabel = eventData?.updatedByActor
                            ? eventData.updatedByActor.kind === "user"
                                ? (eventData.updatedByActor.user?.name ?? null)
                                : `API: ${eventData.updatedByActor.apiKey?.name ?? ""}`
                            : null;
                        return (
                            <>
                                {createdByLabel && eventData && (
                                    <div className="flex items-start gap-3">
                                        <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                                        <div className="text-sm">
                                            Created by {createdByLabel}
                                            <span className="text-muted-foreground">
                                                {" · "}
                                                {formatDateTime(
                                                    eventData.createdAt,
                                                    tz,
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {updatedByLabel && eventData && (
                                    <div className="flex items-start gap-3">
                                        <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                                        <div className="text-sm">
                                            Last edited by {updatedByLabel}
                                            <span className="text-muted-foreground">
                                                {" · "}
                                                {formatDateTime(
                                                    eventData.updatedAt,
                                                    tz,
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    })()}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t pt-4">
                <CopyLinkButton
                    eventId={occurrence.eventId}
                    occurrenceDate={occurrence.occurrenceDate}
                />
                <Button asChild variant="outline">
                    <CloseLink>Close</CloseLink>
                </Button>
                {canEdit && (
                    <Button className="script-only" onClick={onEdit}>
                        Edit
                    </Button>
                )}
            </div>
        </>
    );
}

function SeriesInfoContent({
    eventId,
    canEdit,
}: {
    eventId: string;
    canEdit: boolean;
}) {
    const tz = useAppTimezone();
    const queryClient = useQueryClient();
    const { data: seriesEvent, isLoading } = useQuery(
        eventsQueries.getById(eventId),
    );
    const removeExdate = useMutation({
        mutationFn: (input: Parameters<typeof removeExdateFn>[0]["data"]) =>
            removeExdateFn({ data: input }),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
    });
    const removeOverride = useMutation({
        mutationFn: (input: Parameters<typeof removeOverrideFn>[0]["data"]) =>
            removeOverrideFn({ data: input }),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: eventsKeys.all }),
    });

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
            </div>
        );
    }

    if (!seriesEvent) {
        return (
            <div className="text-muted-foreground text-sm">
                Series not found.
            </div>
        );
    }

    // Parse RRULE for human-readable description
    let rruleDescription: string | null = null;
    if (seriesEvent.rrule) {
        try {
            const baseRule = RRule.fromString(seriesEvent.rrule);
            const rule = new RRule({
                ...baseRule.origOptions,
                dtstart: seriesEvent.dtstart,
            });
            rruleDescription = rule.toText();
        } catch {
            rruleDescription = seriesEvent.rrule;
        }
    }

    // Parse exdates
    const exdates = seriesEvent.exdates ?? [];

    // Overrides
    const overrides = seriesEvent.overrides ?? [];

    return (
        <div className="space-y-4">
            {/* Series summary + badges */}
            <div>
                <div className="font-medium text-lg">{seriesEvent.summary}</div>
                <div className="mt-1 flex items-center gap-2">
                    {getStatusBadge(seriesEvent.status, seriesEvent.isDraft)}
                </div>
            </div>

            {/* Recurrence pattern */}
            {rruleDescription && (
                <div className="flex items-start gap-3">
                    <Repeat className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                        <div className="text-sm capitalize">
                            {rruleDescription}
                        </div>
                        {seriesEvent.frequencyLabel && (
                            <div className="text-muted-foreground text-xs">
                                {seriesEvent.frequencyLabel}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Date range */}
            <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="text-sm">
                    <span>Starts {formatDate(seriesEvent.dtstart, tz)}</span>
                    {seriesEvent.recurrenceEndDate && (
                        <>
                            <br />
                            <span>
                                Ends{" "}
                                {formatDate(seriesEvent.recurrenceEndDate, tz)}
                            </span>
                        </>
                    )}
                    {!seriesEvent.recurrenceEndDate && (
                        <>
                            <br />
                            <span className="text-muted-foreground">
                                No end date
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Excluded dates */}
            {exdates.length > 0 && (
                <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                        <div className="mb-1 font-medium text-sm">
                            Excluded dates ({exdates.length})
                        </div>
                        <ul className="space-y-0.5 text-muted-foreground text-sm">
                            {exdates.map((d) => (
                                <li
                                    className="flex items-center justify-between gap-2"
                                    key={d}
                                >
                                    <span>{formatDateOnly(d)}</span>
                                    {canEdit && (
                                        <button
                                            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                            disabled={removeExdate.isPending}
                                            onClick={() =>
                                                removeExdate.mutate({
                                                    eventId,
                                                    date: d,
                                                })
                                            }
                                            title="Re-include this occurrence"
                                            type="button"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Overridden occurrences */}
            {overrides.length > 0 && (
                <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                        <div className="mb-1 font-medium text-sm">
                            Overridden occurrences ({overrides.length})
                        </div>
                        <ul className="space-y-1 text-sm">
                            {overrides.map((o) => (
                                <li
                                    className="flex items-center justify-between gap-2 text-muted-foreground"
                                    key={o.id}
                                >
                                    <span>
                                        <span className="font-medium text-foreground">
                                            {formatDateOnly(o.occurrenceDate)}
                                        </span>
                                        {" — "}
                                        {describeOverride(o, tz)}
                                    </span>
                                    {canEdit && (
                                        <button
                                            className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                                            disabled={removeOverride.isPending}
                                            onClick={() =>
                                                removeOverride.mutate({
                                                    eventId,
                                                    occurrenceDate:
                                                        o.occurrenceDate,
                                                })
                                            }
                                            title="Remove override"
                                            type="button"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Created by */}
            {(() => {
                const label = seriesEvent.createdByActor
                    ? seriesEvent.createdByActor.kind === "user"
                        ? (seriesEvent.createdByActor.user?.name ?? null)
                        : `API: ${seriesEvent.createdByActor.apiKey?.name ?? ""}`
                    : null;
                return label ? (
                    <div className="flex items-start gap-3">
                        <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="text-sm">
                            Created by {label}
                            <span className="text-muted-foreground">
                                {" · "}
                                {formatDateTime(seriesEvent.createdAt, tz)}
                            </span>
                        </div>
                    </div>
                ) : null;
            })()}

            {/* Last edited by */}
            {(() => {
                const label = seriesEvent.updatedByActor
                    ? seriesEvent.updatedByActor.kind === "user"
                        ? (seriesEvent.updatedByActor.user?.name ?? null)
                        : `API: ${seriesEvent.updatedByActor.apiKey?.name ?? ""}`
                    : null;
                return label ? (
                    <div className="flex items-start gap-3">
                        <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="text-sm">
                            Last edited by {label}
                            <span className="text-muted-foreground">
                                {" · "}
                                {formatDateTime(seriesEvent.updatedAt, tz)}
                            </span>
                        </div>
                    </div>
                ) : null;
            })()}
        </div>
    );
}

/**
 * Rendered only while an occurrence is linked. It closes by removing the
 * link in a view transition (closeOccurrence), which animates the last
 * frame out, so nothing has to stay mounted after closing. A native dialog
 * (ui/dialog.tsx), so it is part of the server HTML: without scripts it is
 * a card above the calendar. Keyed by the occurrence so every occurrence
 * starts on its own first tab
 */
export function EventDetailsDialog({
    occurrence,
    ...props
}: EventDetailsDialogProps) {
    if (!occurrence) return null;
    return (
        <OpenEventDetailsDialog
            key={occurrence.id}
            occurrence={occurrence}
            {...props}
        />
    );
}

function OpenEventDetailsDialog({
    canEdit,
    occurrence,
    onClose,
    onEdit,
}: EventDetailsDialogProps & { occurrence: Occurrence }) {
    const [activeTab, setActiveTab] = useState("occurrence");
    const onOpenChange = (open: boolean) => (open ? undefined : onClose());

    // Single events: flat view (no tabs)
    if (!occurrence.isRecurring) {
        return (
            <Dialog onOpenChange={onOpenChange} open>
                <DialogContent showCloseButton={false}>
                    <DetailsHeader occurrence={occurrence} />
                    <OccurrenceContent
                        canEdit={canEdit}
                        occurrence={occurrence}
                        onEdit={() => onEdit(occurrence)}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    // Recurring events: tabbed view
    return (
        <Dialog onOpenChange={onOpenChange} open>
            <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
                <DetailsHeader occurrence={occurrence} />

                <Tabs onValueChange={setActiveTab} value={activeTab}>
                    {/* Tabs need scripts; without them the first one shows */}
                    <TabsList className="script-only w-full">
                        <TabsTrigger className="flex-1" value="occurrence">
                            This Occurrence
                        </TabsTrigger>
                        <TabsTrigger className="flex-1" value="series">
                            Series Info
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="occurrence">
                        <OccurrenceContent
                            canEdit={canEdit}
                            occurrence={occurrence}
                            onEdit={() => onEdit(occurrence)}
                        />
                    </TabsContent>

                    <TabsContent value="series">
                        <SeriesInfoContent
                            canEdit={canEdit}
                            eventId={occurrence.eventId}
                        />
                        <div className="flex justify-end gap-2 border-t pt-4">
                            <CopyLinkButton
                                eventId={occurrence.eventId}
                                occurrenceDate={occurrence.occurrenceDate}
                            />
                            <Button asChild variant="outline">
                                <CloseLink>Close</CloseLink>
                            </Button>
                            {canEdit && (
                                <Button
                                    className="script-only"
                                    onClick={() => onEdit(occurrence, "whole")}
                                >
                                    Edit Series
                                </Button>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
