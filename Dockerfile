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

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Skip env validation during build (all env vars are read at runtime now)
ENV SKIP_ENV_VALIDATION=1
ENV NODE_ENV=production

RUN pnpm build

# Production runner
FROM node:22-alpine AS runner
WORKDIR /app

# IANA timezone database — required for Node's Intl / date-fns-tz to resolve
# zones like "Europe/Berlin". Without it, lookups silently fall back to UTC,
# so e.g. fromZonedTime("2026-02-03T20:30", "Europe/Berlin") parses as UTC
# and stores events one offset off.
RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what's needed for production
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy drizzle files for migrations
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/env.js ./src/env.js
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER nextjs

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx drizzle-kit migrate && node server.js"]
