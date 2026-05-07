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
FROM node:20.18-alpine AS base
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

# Bring the deps + sources together. node_modules from deps stage already
# has the hoisted layout from its in-image .npmrc.
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* tsconfig*.json .npmrc ./
COPY packages/crypto-core ./packages/crypto-core
COPY apps/web ./apps/web

# Re-apply hoisted .npmrc inside the builder stage too — needed for any
# implicit pnpm calls.
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\nauto-install-peers=true\n' > .npmrc

RUN pnpm --filter @slothbox/web build

# --- Stage 4: minimal runtime image -------------------------------------
FROM node:20.18-alpine AS runner
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
