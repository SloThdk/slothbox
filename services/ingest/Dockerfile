# SlothBox.Ingest — multi-stage container build
#
# Final image is alpine + dotnet/aspnet runtime; expected ~95–100 MB.
# We do NOT use trimming/AOT here because Npgsql + Minio SDK both rely on
# reflection-driven serialisation that AOT-trim has historically broken; we
# keep the simple deploy story and trade ~30 MB of image size for stability.

# ─── Stage 1: restore + build ─────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src

# Restore first so the layer caches well: only invalidates on csproj changes.
COPY SlothBox.Ingest.csproj ./
RUN dotnet restore SlothBox.Ingest.csproj \
    --runtime linux-musl-x64

# Bring in the rest of the source.
COPY . ./

# Publish — Release config, no app-host (uses dotnet runtime instead of a
# native bootstrapper), trimmed to musl.
RUN dotnet publish SlothBox.Ingest.csproj \
    --configuration Release \
    --runtime linux-musl-x64 \
    --self-contained false \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

# ─── Stage 2: runtime ─────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime

# wget is needed by the docker HEALTHCHECK command. The aspnet:8.0-alpine base
# does not ship with it, so we pin it here. ca-certificates lets us reach a
# TLS-fronted MinIO if MINIO_USE_SSL=true.
RUN apk add --no-cache wget ca-certificates \
    && rm -rf /var/cache/apk/*

# Run as a non-root user — the .NET base image runs as root by default.
RUN addgroup -S app && adduser -S app -G app -u 10001
WORKDIR /app

COPY --from=build --chown=app:app /app/publish ./

USER app
EXPOSE 3023

# Globalisation invariant cuts ~30 MB of ICU and is set in the csproj too.
ENV DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_GENERATE_ASPNET_CERTIFICATE=false \
    DOTNET_NOLOGO=true \
    ASPNETCORE_URLS=http://+:3023 \
    INGEST_PORT=3023

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:3023/healthz || exit 1

ENTRYPOINT ["dotnet", "SlothBox.Ingest.dll"]
