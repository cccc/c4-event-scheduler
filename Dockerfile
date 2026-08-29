# syntax=docker/dockerfile:1

# Base image with Node.js and pnpm
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build the application (Vite + TanStack Start -> dist/client + dist/server)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Skip env validation during build (all env vars are read at runtime)
ENV SKIP_ENV_VALIDATION=1
ENV NODE_ENV=production

RUN pnpm build

# Production runner
FROM base AS runner

# IANA timezone database - required for Node's Intl / date-fns-tz to resolve
# zones like "Europe/Berlin". Without it, lookups silently fall back to UTC,
# so e.g. fromZonedTime("2026-02-03T20:30", "Europe/Berlin") parses as UTC
# and stores events one offset off.
RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# The server bundle (dist/server/server.js) exports a `{ fetch }` handler and
# bare-imports its deps; node_modules provides them and srvx serves the bundle
# alongside the static client assets.
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy drizzle files + node_modules so `drizzle-kit migrate` can run at startup
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/env.ts ./src/env.ts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER nodejs

EXPOSE 3000

# Run migrations then start the srvx server (static client assets + SSR fetch
# handler). srvx resolves --static relative to the entry's directory, so both
# paths are absolute.
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit migrate && node node_modules/srvx/bin/srvx.mjs serve --prod --entry /app/dist/server/server.js --static /app/dist/client"]
