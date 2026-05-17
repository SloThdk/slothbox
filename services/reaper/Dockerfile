# SlothBox reaper daemon — multi-stage container build.
#
# Stage 1 (build) — pulls toolchain + deps and produces a stripped static
# binary. We pin to alpine-based golang because it's the smallest official
# image with a working `go` toolchain (debian:bookworm would add ~200 MB
# we don't need and the binary doesn't link against libc anyway thanks to
# CGO_ENABLED=0).
#
# Stage 2 (runtime) — distroless static, nonroot. No shell, no package
# manager, no libc. Final image is < 20 MB and the binary runs as UID 65532.
#
# Build:
#   docker build -t slothbox/reaper:dev .
# Run:
#   docker run --rm -e DATABASE_URL=... -e MINIO_... slothbox/reaper:dev
# One-shot:
#   docker run --rm slothbox/reaper:dev --once

FROM golang:1.25-alpine AS build
WORKDIR /src

# Install ca-certificates so the build cache layer has them; we copy the
# bundle into the final image since distroless:static includes its own.
RUN apk add --no-cache ca-certificates git

# Copy module manifest first for layer caching: dep download only re-runs
# when go.mod / go.sum change.
COPY go.mod go.sum ./
RUN go mod download

# Now copy the rest of the source tree.
COPY . .

# Static, stripped, trimpath. Linux/amd64 is the only target we ship today;
# add buildx + matrix builds when we need ARM in v0.5+.
#
#   -w  strips DWARF debug info
#   -s  strips symbol table
#   -trimpath rewrites file paths so the binary doesn't leak
#       /home/builder/... into reproducible-build hashes.
# Build the main package only (./), not all packages under the module
# (./...). With ./... and `-o /reaper`, go refuses with "cannot write
# multiple packages to non-directory" because internal/reaper is also a
# package — even though it has no main. Build the root package explicitly.
#
# TARGETARCH is provided by docker buildx so the same Dockerfile produces
# native binaries on amd64 dev boxes and arm64 hosts.
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build \
        -ldflags='-w -s' \
        -trimpath \
        -o /reaper \
        .

# Stage 2 — distroless static, nonroot. The :nonroot tag pre-bakes UID 65532
# so we don't need a USER clause (kept anyway for clarity).
FROM gcr.io/distroless/static-debian12:nonroot

# Copy the binary out of the build stage.
COPY --from=build /reaper /reaper

# Run as the non-root user that ships with the distroless image.
USER nonroot:nonroot

# No shell available, so ENTRYPOINT must be exec form.
ENTRYPOINT ["/reaper"]
