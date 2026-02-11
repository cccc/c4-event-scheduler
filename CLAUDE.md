# C4 Event Scheduler

A Next.js event calendar application for scheduling and managing events across multiple spaces.

## Tech Stack

- **Framework**: Next.js 15 with App Router, React 19, TypeScript
- **API**: tRPC 11 with TanStack Query
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: BetterAuth with OIDC support (mock-oauth2-server for dev)
- **UI**: shadcn/ui (Radix UI + Tailwind CSS v4)
- **Calendar**: FullCalendar with RRULE support
- **i18n**: next-intl (EN/DE)
- **Linting**: Biome

## Features

- Multi-space event calendars (each space has its own calendar)
- Event types (global or space-specific)
- Claim-based permissions per space/event type
- Events with: title, description, URL, start/end, status
- Event statuses: pending (draft), tentative, confirmed, cancelled
- Recurring events using RRULE (RFC 5545) with frequencyLabel for display
- Occurrence overrides (cancel/modify specific occurrences)
- Click event to view details, then edit if authorized
- iCal feeds for calendar subscriptions
- Widget API for embedding upcoming events
- OIDC authentication

## Development

```bash
# Start PostgreSQL and mock-oauth2-server
docker compose up -d

# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Start dev server
pnpm dev
```

### Mock OIDC Login

The mock-oauth2-server provides pre-configured test users via dropdown:

| User | Role | Permissions |
|------|------|-------------|
| Admin | `c4:admin` | Full access |
| Space Manager | `c4:space:*` | All spaces |
| Event Editor | `c4:event-type:*` | All event types |
| Viewer | (none) | Read-only |

Select a user from the dropdown to log in with their pre-configured claims.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (main)/            # Main layout routes
│   │   ├── feeds/         # Feed URLs and widget API docs
│   │   └── spaces/        # Space calendars
│   ├── api/
│   │   ├── auth/          # BetterAuth routes
│   │   ├── cal/           # iCal feed routes
│   │   ├── widget/        # Widget API (upcoming events)
│   │   └── trpc/          # tRPC handler
├── components/
│   ├── calendar/          # Calendar dialogs (create, edit, details)
│   ├── ui/                # shadcn/ui components
│   └── space-calendar.tsx # Main calendar component
├── server/
│   ├── api/routers/       # tRPC routers (spaces, events, event-types)
│   ├── better-auth/       # Auth configuration
│   └── db/                # Drizzle schema and connection
├── trpc/                  # tRPC client setup
└── styles/                # Global CSS with FullCalendar theming
```

## Database Tables (c4_ prefix)

- `user` - Users with isAdmin flag
- `space` - Calendar containers (slug, name, isPublic)
- `event_type` - Event templates (global if spaceId is null, space-specific otherwise)
- `event` - Events with optional RRULE, frequencyLabel for recurring display
- `occurrence_override` - Per-occurrence modifications (status, title, time overrides)
- `user_permission` - Claim-based permissions (spaceSlug, eventTypeSlug, source)

## API Endpoints

### iCal Feeds
- `GET /api/cal/all.ics` - All public events
- `GET /api/cal/{space}.ics` - Events for a space
- `GET /api/cal/{space}/{event-type}.ics` - Filtered by event type

### Widget API
- `GET /api/widget/upcoming` - Upcoming events (JSON or HTML)

Query parameters:
| Parameter | Default | Description |
|-----------|---------|-------------|
| `space` | all | Filter by space slug |
| `limit` | 10 | Max events (1-50) |
| `months` | 6 | Future range (1-24) |
| `format` | json | Output: `json` or `html` |
| `locale` | de-DE | Date formatting locale |

## Event Status Display

Calendar events are styled by status:
- **Confirmed**: Solid style (default)
- **Tentative**: Dashed border, italic text
- **Pending**: Dotted border, reduced opacity, striped pattern
- **Cancelled**: Strikethrough, diagonal line pattern

## Environment Variables

See `.env.example` for required configuration.
