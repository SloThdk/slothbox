# SlothBox web — multi-stage Dockerfile
#
# Build context is the monorepo root so we can copy the workspace lockfile and
# the `@slothbox/crypto-core` package alongside the web app. The
# `docker-compose.yml` already passes the right context. If you `docker build`
# this directly, run from the monorepo root:
#
#   docker build -f apps/web/Dockerfile -t slothbox/web .
#
# Three stages: deps → builder → runner. The runner stage uses
# `output: "standalone"` from `next.config.mjs` to keep the final image small
# (~150 MiB on Alpine) and dependency-free at runtime — only the bundled
# server.js + its tracked node_modules ride along.

# --- Stage 1: base image -------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apk add --no-cache libc6-compat dumb-init wget

# --- Stage 2: install workspace deps ------------------------------------
FROM base AS deps
WORKDIR /repo

# Copy only the dep manifests first so Docker caches install layers.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/crypto-core/package.json ./packages/crypto-core/

# In-image .npmrc forces hoisted layout (same reason as api-gateway —
# pnpm's symlinked layout breaks Next's webpack resolution of workspace
# packages inside Docker, even with transpilePackages set).
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\nauto-install-peers=true\n' > .npmrc

# Install needed workspace packages.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --filter @slothbox/web... --filter @slothbox/crypto-core

# --- Stage 3: build the Next standalone output ---------------------------
FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/crypto-core/node_modules ./packages/crypto-core/node_modules

# Bring the actual source.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* tsconfig*.json ./
COPY packages/crypto-core ./packages/crypto-core
COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @slothbox/web build

# --- Stage 4: minimal runtime image -------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3021
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache wget dumb-init

# Drop privileges — the runtime never needs root.
RUN addgroup -S nodejs -g 1001 \
    && adduser  -S nextjs   -u 1001 -G nodejs

# Next's standalone output already includes a minimal node_modules subset;
# the public/ + .next/static directories must be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3021

# Healthcheck mirrors `docker-compose.yml`; runs every 30s.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD wget -qO- http://localhost:3021/api/healthz >/dev/null 2>&1 || exit 1

# `dumb-init` reaps zombie processes — Next forks a child for the build trace
# uploader on first request and we want SIGTERM to propagate cleanly.
ENTRYPOINT ["dumb-init", "--"]

# `server.js` is emitted by Next's standalone output and starts the http
# server on $PORT.
CMD ["node", "apps/web/server.js"]
