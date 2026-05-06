# SlothBox API gateway — minimal runtime image.
#
# IMPORTANT: this Dockerfile expects the tsup bundle to be pre-built locally,
# NOT inside the container. Same reasoning as apps/web/Dockerfile — pnpm +
# workspace deps + tsup interact badly inside multi-stage builds, and we
# already do a local `pnpm install && pnpm --filter @slothbox/api-gateway
# build` as part of the dev/CI workflow.
#
# Pre-build steps (CI runs these):
#   pnpm install
#   pnpm --filter @slothbox/api-gateway build
#   docker build -f apps/api-gateway/Dockerfile -t slothbox/api-gateway .
#
# The container ships the bundled dist/index.js and the root node_modules
# tree. With node-linker=hoisted (.npmrc) the root tree is npm-style flat
# and reusable as-is at runtime. Final image is ~250 MiB (node base + deps).

FROM node:20.18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    API_PORT=3022 \
    API_HOST=0.0.0.0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache --update wget dumb-init \
    && rm -rf /var/cache/apk/*

# Non-root user.
RUN addgroup -S slothbox && \
    adduser -S -G slothbox -u 10001 slothbox

# Copy the bundled artefact and the (hoisted) production node_modules tree.
# We bring the whole root node_modules; v0.5 will swap to `pnpm deploy --prod`
# pruning to shrink the image.
COPY --chown=slothbox:slothbox apps/api-gateway/dist ./dist
COPY --chown=slothbox:slothbox apps/api-gateway/package.json ./package.json
COPY --chown=slothbox:slothbox node_modules ./node_modules

USER slothbox

EXPOSE 3022

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3022/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
