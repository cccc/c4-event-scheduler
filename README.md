# C4 Event Scheduler

A multi-space event calendar application with recurring events, iCal feeds, and OIDC authentication.

## Features

- Multi-space calendars with per-space event types
- Recurring events (RRULE / RFC 5545) with per-occurrence overrides
- Event statuses: confirmed, tentative, pending (draft), cancelled
- iCal feed endpoints for calendar subscriptions
- Widget API for embedding upcoming events (JSON or HTML)
- Claim-based permissions via OIDC provider
- (Internationalization (EN/DE) - there is currently no language picker but the capability is already implemented)

## Tech Stack

Next.js 15, React 19, TypeScript, tRPC 11, PostgreSQL, Drizzle ORM, BetterAuth (OIDC), shadcn/ui, FullCalendar, next-intl

## Development

### Prerequisites

- [pnpm](https://pnpm.io/) 10.x (or use [mise](https://mise.jdx.dev/) — `mise install`)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Setup

```bash
# Start PostgreSQL and mock-oauth2-server
docker compose up -d

# Install dependencies
pnpm install

# Copy and adjust environment variables
cp .env.example .env

# Push database schema
pnpm db:push

# Start dev server
pnpm dev
```

The app runs at `http://localhost:3000`.

### Mock OIDC Login

The mock-oauth2-server (`http://localhost:8080`) provides test users via a login dropdown:

| User          | Claims            | Access          |
| ------------- | ----------------- | --------------- |
| Admin         | `c4:admin`        | Full access     |
| Space Manager | `c4:space:*`      | All spaces      |
| Event Editor  | `c4:event-type:*` | All event types |
| Viewer        | (none)            | Read-only       |

### Useful Commands

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `pnpm dev`         | Start dev server (Turbopack)    |
| `pnpm build`       | Production build                |
| `pnpm start`       | Start production server         |
| `pnpm typecheck`   | Run TypeScript type checking    |
| `pnpm check`       | Run Biome linter/formatter      |
| `pnpm check:write` | Auto-fix lint/format issues     |
| `pnpm db:push`     | Push schema changes to database |
| `pnpm db:generate` | Generate a migration            |
| `pnpm db:migrate`  | Run migrations                  |
| `pnpm db:studio`   | Open Drizzle Studio             |

## Deployment

### Container Image

A Docker image is built and pushed to `ghcr.io` on every push to `main` via GitHub Actions. The image runs database migrations on startup, then starts the Next.js server.

```bash
docker pull ghcr.io/<owner>/c4-event-scheduler:latest
```

### Running the Container

The container requires a PostgreSQL database and an OIDC provider. Configure via environment variables (see `.env.example`):

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/c4_events" \
  -e BETTER_AUTH_BASE_URL="https://events.example.com" \
  -e BETTER_AUTH_SECRET="<random-secret>" \
  -e BETTER_AUTH_OIDC_CLIENT_ID="c4-events-app" \
  -e BETTER_AUTH_OIDC_CLIENT_SECRET="<client-secret>" \
  -e BETTER_AUTH_OIDC_ISSUER="https://auth.example.com/realms/main" \
  -e NEXT_PUBLIC_APP_URL="https://events.example.com" \
  -e NEXT_PUBLIC_AUTH_SSO_ENABLED=true \
  ghcr.io/cccc/c4-event-scheduler:latest
```

## API Endpoints

### iCal Feeds

- `GET /api/cal/all.ics` — All public events
- `GET /api/cal/{space}.ics` — Events for a specific space
- `GET /api/cal/{space}/{event-type}.ics` — Filtered by event type

### Widget API

`GET /api/widget/upcoming` — Upcoming events as JSON or HTML.

| Parameter | Default | Description            |
| --------- | ------- | ---------------------- |
| `space`   | all     | Filter by space slug   |
| `limit`   | 10      | Max events (1-50)      |
| `months`  | 6       | Future range (1-24)    |
| `format`  | json    | `json` or `html`       |
| `locale`  | de-DE   | Date formatting locale |

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                 |
| `BETTER_AUTH_BASE_URL` | Public URL of the app                        |
| `BETTER_AUTH_SECRET`   | Auth session secret                          |
| `BETTER_AUTH_OIDC_*`   | OIDC provider configuration                  |
| `OIDC_CLAIM_PREFIX`    | Prefix for permission claims (default: `c4`) |
| `OIDC_ROLES_CLAIM`     | Dot-notation path to roles in OIDC token     |
| `NEXT_PUBLIC_APP_URL`  | Public app URL for feeds and callbacks       |
