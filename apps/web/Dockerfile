# SlothBox web — minimal runtime image.
#
# IMPORTANT: this Dockerfile expects the Next.js standalone output to be
# pre-built locally, NOT inside the container. Reasons:
#
#   * Next + pnpm + workspace packages + libsodium WASM all interact in ways
#     that make in-container installs fragile. Building locally where the
#     toolchain matches the dev workflow keeps the build deterministic.
#   * The CI pipeline runs `pnpm install && pnpm --filter @slothbox/web build`
#     before invoking `docker build`. The image then becomes a small runtime
#     wrapper around the standalone output.
#
# Pre-build steps (CI runs these; matches `package.json` scripts):
#   pnpm install
#   pnpm --filter @slothbox/web build
#   docker build -f apps/web/Dockerfile -t slothbox/web .
#
# Final image: ~150 MiB, Alpine + Node 20 LTS + standalone Next bundle.
# No pnpm, no source code, no build tooling at runtime.

FROM node:20.18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3021 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# wget for the HEALTHCHECK; dumb-init reaps zombie processes from any child
# spawned by Next's runtime (build-trace uploader, etc).
RUN apk add --no-cache --update wget dumb-init \
    && rm -rf /var/cache/apk/*

# Drop privileges — the runtime never needs root.
RUN addgroup -S nodejs -g 1001 \
    && adduser  -S nextjs  -u 1001 -G nodejs

# Next's `output: "standalone"` produces a self-contained server.js with a
# tracked node_modules subset under .next/standalone. The .next/static dir
# and public/ files must be copied alongside.
COPY --chown=nextjs:nodejs apps/web/.next/standalone ./
COPY --chown=nextjs:nodejs apps/web/.next/static ./apps/web/.next/static
COPY --chown=nextjs:nodejs apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3021

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD wget -qO- http://localhost:3021/api/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["dumb-init", "--"]

# server.js sits at the root of the standalone output; PORT is read from env.
CMD ["node", "apps/web/server.js"]
