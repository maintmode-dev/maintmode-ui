# syntax=docker/dockerfile:1

# maintmode-ui — Next.js (App Router + BFF) production image.
#
# This is NOT a static site: src/app/api/** route handlers, NextAuth v5, and
# the server-only BFF in src/server/** require a Node runtime. We build the
# standalone output (next.config.ts -> output: "standalone") and ship it on a
# minimal slim base. Runtime configuration is supplied via --env-file at
# `docker run` time (see deployment/<env>/app.env), never baked into the image.
#
# Build context is the repository root:
#   docker build -f deployment/.build/Dockerfile -t maintmode-ui .

ARG NODE_VERSION=22

# --- Stage 0: dependencies ---------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app

# Install with the lockfile only so this layer is cached until deps change.
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=maintmode-ui-npm,target=/root/.npm \
    npm ci

# --- Stage 1: build ----------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next collects page data for the API routes at build time, which initializes
# the NextAuth/auth-config module and triggers its env validation (AUTH_SECRET,
# Google client id/secret). These are NOT baked into the image — they are
# placeholder values that exist only for the duration of `next build`. The real
# runtime values come from --env-file at `docker run` time. AUTH_SECRET must be
# >= 32 chars and APP_BASE_URL must be a valid http(s) URL to pass validation.
ENV MAINTMODE_AUTH_SECRET=build-time-placeholder-secret-32chars-min \
    MAINTMODE_APP_BASE_URL=http://localhost:3000 \
    MAINTMODE_GOOGLE_OAUTH_CLIENT_ID=build-time-placeholder \
    MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET=build-time-placeholder
RUN --mount=type=cache,id=maintmode-ui-next,target=/app/.next/cache \
    npm run build

# --- Stage 2: runtime --------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone output bundles a minimal node_modules + server.js. Static
# assets and the public/ dir are copied alongside it as Next expects.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# server.js is emitted at the root of the standalone bundle.
CMD ["node", "server.js"]
