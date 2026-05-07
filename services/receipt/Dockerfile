# SlothBox.Receipt — multi-stage Alpine build.
#
# Mirrors services/ingest/Dockerfile so the two .NET services stay in lockstep.
#
# Final image budget: under 100 MB. The aspnet:8.0-alpine base is ~85 MB; our
# published output is a few MB on top. Trimming is OFF in v0.1 because it
# breaks BouncyCastle reflection paths v0.5 will rely on — keep it predictable.

# ─── Build stage ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

# TARGETARCH is set by docker buildx (amd64/arm64). Map to .NET runtime
# identifier so the same Dockerfile builds on local x86 + the ARM
# production VM.
ARG TARGETARCH=amd64
RUN case "$TARGETARCH" in \
      amd64) echo "linux-musl-x64" > /tmp/rid ;; \
      arm64) echo "linux-musl-arm64" > /tmp/rid ;; \
      *) echo "unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac

# Restore first (cache-friendly: deps change less often than source).
COPY SlothBox.Receipt.csproj ./
RUN dotnet restore SlothBox.Receipt.csproj --runtime "$(cat /tmp/rid)"

# Now copy the rest and publish.
COPY . ./
RUN dotnet publish SlothBox.Receipt.csproj \
    --configuration Release \
    --runtime "$(cat /tmp/rid)" \
    --self-contained false \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

# ─── Runtime stage ────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
WORKDIR /app

# Non-root execution. dotnet/aspnet:8.0-alpine ships an `app` user/group on
# current tags so we use a dedicated `slothbox` group/user (UID 10002 — the
# ingest service uses 10001, keeping per-service UIDs distinct simplifies
# host-volume permission audits if we ever bind-mount one).
RUN getent group slothbox >/dev/null 2>&1 || addgroup -S slothbox \
    && (id slothbox >/dev/null 2>&1 || adduser -S -G slothbox -u 10002 slothbox)

# Install wget so the HEALTHCHECK below doesn't need a separate base image.
# `--no-cache` keeps the layer small.
RUN apk add --no-cache wget icu-libs

# Copy published artefacts and chown to the non-root user.
COPY --from=build --chown=slothbox:slothbox /app/publish ./

USER slothbox

# Standard ASP.NET Core env: bind on the receipt port, run as Production by
# default. docker-compose overrides ASPNETCORE_ENVIRONMENT for dev.
ENV ASPNETCORE_URLS=http://+:3024 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_USE_POLLING_FILE_WATCHER=true \
    RECEIPT_PORT=3024

EXPOSE 3024

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD wget -qO- http://localhost:3024/healthz || exit 1

ENTRYPOINT ["dotnet", "SlothBox.Receipt.dll"]
