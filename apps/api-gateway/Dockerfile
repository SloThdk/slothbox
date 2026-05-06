# SlothBox API gateway — multi-stage build.
#
# Stage 1: build — install all deps (including dev), compile TS via tsup.
# Stage 2: runtime — slim Node image, prod deps only, non-root user.
#
# The image is intentionally Alpine-based for size; libc differences
# from glibc-based images don't matter for our pure-JS deps. If a
# native-binary dep is ever added (e.g. argon2), revisit and consider
# distroless or debian-slim.

ARG NODE_VERSION=20.18.0

# ─── Stage 1: build ────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS build

# pnpm via corepack — pinned to the version declared in the monorepo
# root package.json so all builds are deterministic.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /workspace

# Copy workspace metadata first so dependency installs cache cleanly.
# The build context is the api-gateway dir, so we need to bring in the
# wider monorepo files. Compose builds the image with context=./apps/
# api-gateway by default — to get monorepo packages we instead build
# from the repo root and pass `dockerfile: apps/api-gateway/Dockerfile`.
# Document that here so it doesn't surprise anyone running an ad-hoc
# `docker build`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/db/package.json ./packages/db/
COPY packages/crypto-core/package.json ./packages/crypto-core/

# Install everything (including dev deps — needed for tsup).
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

# Now copy source and build.
COPY packages/db ./packages/db
COPY apps/api-gateway ./apps/api-gateway

RUN pnpm --filter @slothbox/api-gateway run build

# Prune dev deps so the runtime image only carries what it needs.
RUN pnpm --filter @slothbox/api-gateway --prod deploy /out

# ─── Stage 2: runtime ──────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime

ENV NODE_ENV=production \
    API_PORT=3022 \
    API_HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Create a non-root user. node:alpine ships with `node:1000` already,
# but creating an explicit `slothbox` user makes intent obvious to
# anyone reading the image manifest.
RUN addgroup -S slothbox && \
    adduser -S -G slothbox -u 10001 -h /app slothbox

WORKDIR /app

# Copy pruned production node_modules + compiled JS from the build stage.
COPY --from=build --chown=slothbox:slothbox /out /app

# Non-root, please.
USER slothbox

EXPOSE 3022

# Healthcheck against /healthz — matches the compose-level check too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3022/healthz || exit 1

# Direct exec — no shell wrapper, so signals reach the Node process.
CMD ["node", "dist/index.js"]
