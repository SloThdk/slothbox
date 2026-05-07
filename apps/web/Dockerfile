# SlothBox web — multi-stage Dockerfile
#
# Build context is the monorepo root (compose passes `context: .`,
# `dockerfile: apps/web/Dockerfile`).
#
# This Dockerfile builds Next.js 15 + the @slothbox/crypto-core workspace
# package fully inside Docker so the host doesn't need a Node toolchain.
#
# Three stages:
#   1. base    — pnpm + corepack
#   2. deps    — pnpm install with hoisted layout (.npmrc inside image)
#   3. builder — copy source, run next build, output standalone
#   4. runner  — minimal Node 20 alpine, runs server.js
#
# Build args:
#   TARGETARCH — set automatically by docker buildx (amd64/arm64); used so
#                Node arch-specific deps (sharp, esbuild) install correctly.

# --- Stage 1: base image -------------------------------------------------
FROM node:20-alpine AS base
# Float to 20.x latest. Pinned 20.18 fails on transitive deps that require
# >=20.19 (eslint-visitor-keys@5.0.1's engines field). 20-alpine resolves
# to whichever 20.x is current on Docker Hub at build time.
ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_INTEGRITY_KEYS=0
# corepack's auto-fetch hits a "Cannot find matching keyid" verification bug
# on Node 20.18. We pin pnpm 9.12.3 explicitly via `corepack prepare` to
# skip the auto-fetch path. COREPACK_INTEGRITY_KEYS=0 is belt-and-braces.
RUN apk add --no-cache libc6-compat dumb-init wget && \
    corepack enable && \
    corepack prepare pnpm@9.12.3 --activate

# --- Stage 2: install deps -----------------------------------------------
FROM base AS deps
WORKDIR /repo

# In-image .npmrc forces hoisted layout. Reasons documented in the workspace
# .npmrc — libsodium ESM packaging, styled-jsx → client-only resolution,
# tsup binary visibility under filter mode — all break on pnpm's strict
# layout. Hoisted = npm-style flat = works.
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\nauto-install-peers=true\n' > .npmrc

# Copy only manifests first so the install layer caches across source edits.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/crypto-core/package.json ./packages/crypto-core/

# Filtered install — only the deps that web + crypto-core need.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --filter @slothbox/web... --filter @slothbox/crypto-core

# --- Stage 3: build the standalone output --------------------------------
FROM base AS builder
WORKDIR /repo

# NEXT_PUBLIC_* build args.
#
# Next.js inlines NEXT_PUBLIC_* variables into the client JS bundle AT
# BUILD TIME — they get baked into the .next/static/chunks/*.js as literal
# strings. Setting them via `environment:` in docker-compose only
# propagates at RUNTIME, which is too late for the bundle. The values
# must be ARG-ed in the Dockerfile and ENV-exported during the build
# step so Webpack picks them up.
#
# docker-compose passes these via build.args; defaults below match
# bare-localhost-via-Caddy so an ad-hoc `docker build .` still works.
ARG NEXT_PUBLIC_API_URL=http://localhost
ARG NEXT_PUBLIC_WS_URL=ws://localhost
ARG NEXT_PUBLIC_INGEST_URL=http://localhost
ARG NEXT_PUBLIC_PUBLIC_URL=http://localhost
ARG NEXT_PUBLIC_MAX_FILE_SIZE_MB=4096
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_INGEST_URL=$NEXT_PUBLIC_INGEST_URL \
    NEXT_PUBLIC_PUBLIC_URL=$NEXT_PUBLIC_PUBLIC_URL \
    NEXT_PUBLIC_MAX_FILE_SIZE_MB=$NEXT_PUBLIC_MAX_FILE_SIZE_MB

# Re-apply hoisted .npmrc inside the builder stage too — needed for the
# implicit pnpm install below. .npmrc must exist BEFORE manifests are
# copied so pnpm picks it up at install time.
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\nauto-install-peers=true\n' > .npmrc

# Bring manifests + source. We re-install rather than COPYing the deps
# stage's node_modules because pnpm's workspace symlinks don't survive a
# COPY between stages (the symlinks point to relative paths that resolve
# differently after the copy).
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* tsconfig*.json ./
COPY packages/crypto-core ./packages/crypto-core
COPY apps/web ./apps/web

# Workspace install — this materialises the symlinks for @slothbox/crypto-core
# inside apps/web/node_modules so Next webpack can resolve the import.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --filter @slothbox/web... --filter @slothbox/crypto-core

RUN pnpm --filter @slothbox/web build

# --- Stage 4: minimal runtime image -------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3021 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache --update wget dumb-init \
    && rm -rf /var/cache/apk/*

# Drop privileges — the runtime never needs root.
RUN addgroup -S nodejs -g 1001 \
    && adduser  -S nextjs   -u 1001 -G nodejs

# Next's `output: "standalone"` produces a self-contained server.js with a
# tracked node_modules subset under .next/standalone. The .next/static dir
# and public/ files must be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3021

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD wget -qO- http://localhost:3021/api/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
