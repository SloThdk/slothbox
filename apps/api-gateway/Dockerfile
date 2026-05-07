# SlothBox API gateway — multi-stage Dockerfile
#
# Build context is the monorepo root (compose passes `context: .`,
# `dockerfile: apps/api-gateway/Dockerfile`).
#
# Builds the tsup ESM bundle inside Docker so the host doesn't need a Node
# toolchain. Workspace packages (@slothbox/db, @slothbox/crypto-core) are
# inlined into the bundle by tsup.config.ts (noExternal), so the runtime
# image doesn't need pnpm or its symlinks to resolve them.
#
# Three stages:
#   1. base    — pnpm via corepack + dumb-init + wget
#   2. builder — install all workspace deps, run tsup
#   3. runner  — minimal Node 20 alpine, only the bundled dist + prod deps

# --- Stage 1: base ----------------------------------------------------
FROM node:26-alpine AS base
# Float to 20.x latest — see apps/web/Dockerfile for the engines-compat
# explanation (eslint-visitor-keys@5.0.1 needs >=20.19).
ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    COREPACK_INTEGRITY_KEYS=0
# Pin pnpm explicitly. corepack's auto-fetch hits a key-verification bug on
# this Node version. See apps/web/Dockerfile for the same workaround.
RUN apk add --no-cache libc6-compat dumb-init wget && \
    corepack enable && \
    corepack prepare pnpm@9.12.3 --activate

# --- Stage 2: build ----------------------------------------------------
FROM base AS builder
WORKDIR /repo

# Hoisted layout fixes pnpm's strict node_modules issues with tsup binary
# resolution and libsodium ESM packaging. Same workaround as apps/web.
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\nauto-install-peers=true\n' > .npmrc

# Manifests first for cache friendliness.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/db/package.json ./packages/db/
COPY packages/crypto-core/package.json ./packages/crypto-core/

# Filtered install — api-gateway + its workspace deps + dev deps for tsup.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --filter @slothbox/api-gateway...

# Bring source in.
COPY packages/db ./packages/db
COPY packages/crypto-core ./packages/crypto-core
COPY apps/api-gateway ./apps/api-gateway

# Re-apply hoisted .npmrc in the builder stage layer.
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\nauto-install-peers=true\n' > .npmrc

# Bundle. tsup.config.ts inlines workspace packages so the runtime image
# doesn't need them as separate symlinks.
RUN pnpm --filter @slothbox/api-gateway build

# Prune to production deps. `pnpm deploy --prod` materialises a self-contained
# directory at /out with only the runtime deps that the bundle imports.
RUN pnpm --filter @slothbox/api-gateway --prod deploy /out

# --- Stage 3: runtime --------------------------------------------------
FROM node:26-alpine AS runner

ENV NODE_ENV=production \
    API_PORT=3022 \
    API_HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache --update wget dumb-init \
    && rm -rf /var/cache/apk/*

# Non-root user.
RUN addgroup -S slothbox && \
    adduser -S -G slothbox -u 10001 slothbox

WORKDIR /app

# Copy the pruned production bundle (dist + node_modules + package.json).
COPY --from=builder --chown=slothbox:slothbox /out /app

USER slothbox
EXPOSE 3022

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3022/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
