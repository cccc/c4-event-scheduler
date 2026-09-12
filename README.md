# C4 Event Scheduler

A multi-space event calendar application with recurring events, iCal feeds, and OIDC authentication.

## Features

- Multi-space calendars with per-space event types; the home page opens the default space (or the space list if none is set)
- Recurring events (RRULE / RFC 5545) with per-occurrence overrides
- Event statuses: confirmed, tentative, pending (draft), cancelled
- iCal feed endpoints for calendar subscriptions
- Widget API for embedding upcoming events (JSON or HTML)
- Claim-based permissions via OIDC provider
- Admin-managed local (email/password) accounts alongside SSO, with a self-service account page

## Tech Stack

TanStack Start (Vite, TanStack Router + Query), React 19, TypeScript, PostgreSQL, Drizzle ORM, BetterAuth (OIDC), shadcn/ui, FullCalendar

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
| `pnpm dev`         | Start Vite dev server           |
| `pnpm build`       | Production build                |
| `pnpm start`       | Serve the production build      |
| `pnpm typecheck`   | Run TypeScript type checking    |
| `pnpm check`       | Run Biome linter/formatter      |
| `pnpm check:write` | Auto-fix lint/format issues     |
| `pnpm db:push`     | Push schema changes to database |
| `pnpm db:generate` | Generate a migration            |
| `pnpm db:migrate`  | Run migrations                  |
| `pnpm db:studio`   | Open Drizzle Studio             |

## Deployment

### Container Image

A Docker image is built and pushed to `ghcr.io` on every push to `main` via GitHub Actions. The image runs database migrations on startup, then serves the TanStack Start build (`dist/`) with [srvx](https://srvx.h3.dev/).

```bash
docker pull ghcr.io/cccc/c4-event-scheduler:latest
```

### Running the Container

The container requires a PostgreSQL database and an OIDC provider. Configure via environment variables (see `.env.example`):

Register `<BETTER_AUTH_URL>/api/auth/callback/oidc` as the redirect URI at your OIDC provider.
If the provider still has the older `/api/auth/oauth2/callback/oidc` registered, set
`BETTER_AUTH_OIDC_REDIRECT_URI` to that full URL instead; the app keeps serving the old path.

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/c4_events" \
  -e BETTER_AUTH_URL="https://events.example.com" \
  -e BETTER_AUTH_SECRET="<random-secret>" \
  -e BETTER_AUTH_OIDC_CLIENT_ID="c4-events-app" \
  -e BETTER_AUTH_OIDC_CLIENT_SECRET="<client-secret>" \
  -e BETTER_AUTH_OIDC_ISSUER="https://auth.example.com/realms/main" \
  -e APP_URL="https://events.example.com" \
  -e APP_TIMEZONE="Europe/Berlin" \
  -e AUTH_SSO_ENABLED=true \
  ghcr.io/cccc/c4-event-scheduler:latest
```

## API Endpoints

### iCal Feeds

- `GET /api/cal/all.ics` — All public events
- `GET /api/cal/{space}.ics` — Events for a specific space
- `GET /api/cal/{space}/{event-type}.ics` — Filtered by event type
- `GET /api/cal/all/{event-type}.ics` — One event type across all public spaces

The Subscribe menus on the site offer each feed as a `webcal:` link (opens the
calendar app on iOS, macOS, Outlook and Thunderbird) and as the plain URL.

Feeds are public and contain only public spaces and non-internal event types.
An API key (see below) unlocks internal event types and non-public
spaces; pass it as `?key=c4k_...` in the feed URL, since calendar clients
cannot send headers. Clients that can send headers may use `X-Api-Key`,
`Authorization: Bearer`, or HTTP Basic auth with the username `apikey` and the
key as the password instead — precedence is query parameter, then `X-Api-Key`,
then `Authorization`, and the same headers work on the REST API.
Use the key without its `#fingerprint` suffix in URLs, or URL-encode the `#`
as `%23` — an un-encoded `#` would be treated as a URL fragment and cut off.
A feed URL with an invalid key returns 401 instead of silently falling back to
the public subset. Note that keys in URLs can end up in proxy logs; treat such
feed URLs as secrets. Draft events never appear in feeds.

### Feed tokens

Signed-in users get a personal feed token (created on demand, shown under
**Account -> Feed token**). Appended as `?key=c4f_...`, it makes the feeds
include internal event types and private spaces, exactly like an API key would, but it
is honoured by the feed routes only, never by the REST API. Regenerating it invalidates
every subscription built with the old one. Like feed URLs with keys, treat such links
as secrets.

### API keys

There are two kinds of keys, both usable for the REST API and the feeds:

- **Personal keys** are created by any signed-in user under **Account -> API Keys** and
  managed exactly like service keys (name, admin flag, a list of permissions). The
  difference is the owner: every request must be allowed by the key's own permissions
  *and* by the owner's current permissions, the key's admin flag only counts while the
  owner is an admin, only scopes the owner has can be granted, events created through
  the key are attributed to the owner, and the key is deleted with the user. A key
  without any permissions can read everything a signed-in user sees (also in feeds) but
  cannot modify anything. Admins see every personal key
  under **Admin -> Users** (per user) and in the "Personal keys" section of
  **Admin -> API Keys**, with the same controls.
- **Service keys** are created by admins under **Admin -> API Keys** and carry their own
  admin flag and permission list, for integrations not tied to a person.

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

| Variable                    | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                                         |
| `BETTER_AUTH_URL`           | Public URL of the app                                                |
| `BETTER_AUTH_SECRET`        | Auth session secret                                                  |
| `BETTER_AUTH_OIDC_*`        | OIDC provider configuration                                          |
| `OIDC_CLAIM_PREFIX`         | Prefix for permission claims (default: `c4`)                         |
| `OIDC_ROLES_CLAIM`          | Dot-notation path to roles in OIDC token                             |
| `AUTH_EMAIL_ENABLED`        | Email/password sign-in for local accounts (default `false`)          |
| `AUTH_EMAIL_SIGNUP_ENABLED` | Open public self-registration (default `false`; needs email sign-in) |
| `AUTH_SSO_USERS_ADMIN`      | `true` makes every user signed in via OIDC an admin (see below)      |
| `AUTH_LOG_LEVEL`            | Auth log verbosity: `debug`, `info` (default), `warn`, `error`       |
| `APP_URL`                   | Public app URL for feeds and callbacks                               |
| `APP_TIMEZONE`              | IANA timezone (e.g. `Europe/Berlin`)                                 |


### SSO-users-are-admins mode

Set `AUTH_SSO_USERS_ADMIN=true` to treat every user who signed in through the OIDC
provider as an admin, regardless of their claims or the stored admin flag. Use it when
everyone with an account at the identity provider should be able to manage events, while
local email/password accounts (e.g. created for external people) keep only the
permissions granted to them under **Admin -> Users**. API keys are not affected either.
Nothing is written to the database, so turning it off restores the real permissions. A
warning is logged at startup and on every login while it is enabled.

### Users and local accounts

Admins manage users under **Admin -> Users**: permissions, admin status, and local
email/password accounts (create, edit, reset password, delete). Public self-registration is
disabled unless `AUTH_EMAIL_SIGNUP_ENABLED=true`; local sign-in requires `AUTH_EMAIL_ENABLED=true`.
Every signed-in user can change
their display name (and, for local accounts, their password) under **Account**.

### Auth logging

Authentication and authorization events are logged as single lines prefixed with `[auth]`:

- logins (session creation), user creation, and the roles found in the OIDC ID token
  (including warnings when `OIDC_ROLES_CLAIM` does not match anything in the token)
- unauthenticated requests to protected tRPC procedures and REST endpoints
- denied permission checks, with the action, scope, and the actor's effective permissions
- rejected API keys (only the public `#fingerprint` suffix is logged, never the key)
- BetterAuth's own diagnostics (OAuth callback and state errors)

`AUTH_LOG_LEVEL=debug` additionally logs every *granted* permission check and API key
authentication, which is useful when tracking down why a user can or cannot do something.
