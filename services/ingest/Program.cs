// SlothBox.Ingest — entry point.
//
// Wiring sequence:
//   1. Bind & validate IngestOptions from environment (hard-fail on missing).
//   2. Configure Serilog as the host logger (compact JSON to stdout).
//   3. Configure Kestrel: bind 0.0.0.0:port, set 10 MB max body cap.
//   4. Strip Server header.
//   5. Register DI: shares repo, blob storage, rate limiter as singletons.
//   6. Map endpoints: /healthz, /metrics, /chunk PUT/GET/DELETE.
//   7. Run.

using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Prometheus;
using Serilog;
using Serilog.Formatting.Compact;
using SlothBox.Ingest.Configuration;
using SlothBox.Ingest.Endpoints;
using SlothBox.Ingest.Services;

// ─── Bootstrap logger ────────────────────────────────────────────
// Serilog needs a logger up before the host builder so startup errors are
// captured in the same format as the rest of the lifecycle.
Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .Enrich.WithProperty("service", "slothbox-ingest")
    .WriteTo.Console(new CompactJsonFormatter())
    .CreateBootstrapLogger();

try
{
    Log.Information("SlothBox.Ingest starting up");

    var builder = WebApplication.CreateBuilder(args);

    // ─── Options binding ─────────────────────────────────────────
    // Environment > appsettings; we set the defaults from env explicitly so
    // we can validate before the host starts.
    var options = LoadOptionsFromEnvironment();

    var validationError = options.Validate();
    if (validationError is not null)
    {
        Log.Fatal("Invalid configuration: {Error}", validationError);
        return 1;
    }

    builder.Services.Configure<IngestOptions>(o =>
    {
        o.Port = options.Port;
        o.DatabaseUrl = options.DatabaseUrl;
        o.MinioEndpoint = options.MinioEndpoint;
        o.MinioAccessKey = options.MinioAccessKey;
        o.MinioSecretKey = options.MinioSecretKey;
        o.MinioBucket = options.MinioBucket;
        o.MinioRegion = options.MinioRegion;
        o.MinioUseSsl = options.MinioUseSsl;
        o.RedisUrl = options.RedisUrl;
        o.InternalToken = options.InternalToken;
        o.MaxChunkBytes = options.MaxChunkBytes;
        o.NonceBytes = options.NonceBytes;
    });

    // ─── Serilog as host logger ─────────────────────────────────
    builder.Host.UseSerilog((ctx, sp, cfg) =>
    {
        cfg.ReadFrom.Configuration(ctx.Configuration)
           .ReadFrom.Services(sp)
           .Enrich.FromLogContext()
           .Enrich.WithProperty("service", "slothbox-ingest")
           .WriteTo.Console(new CompactJsonFormatter());

        // LOG_LEVEL controls the Serilog minimum.
        var levelFromEnv = Environment.GetEnvironmentVariable("LOG_LEVEL");
        if (!string.IsNullOrEmpty(levelFromEnv))
        {
            if (Enum.TryParse<Serilog.Events.LogEventLevel>(levelFromEnv, ignoreCase: true, out var lvl))
            {
                cfg.MinimumLevel.Is(lvl);
            }
        }
    });

    // ─── Kestrel: stream-friendly limits, suppress server header ─
    builder.WebHost.ConfigureKestrel((ctx, kestrel) =>
    {
        // Hard cap at 10 MB per chunk. Per-endpoint overrides are noted in
        // UploadEndpoint via [RequestSizeLimit].
        kestrel.Limits.MaxRequestBodySize = options.MaxChunkBytes;

        // Slow-loris defence — if a client takes more than 30s to send 1 KB/s
        // they're either malicious or on a terrible connection; either way we
        // don't owe them a worker thread.
        kestrel.Limits.MinRequestBodyDataRate =
            new Microsoft.AspNetCore.Server.Kestrel.Core.MinDataRate(
                bytesPerSecond: 1024,
                gracePeriod: TimeSpan.FromSeconds(30));

        // Drop the Server: Kestrel response header.
        kestrel.AddServerHeader = false;

        kestrel.ListenAnyIP(options.Port);
    });

    // ─── DI: app services ───────────────────────────────────────
    builder.Services.AddSingleton<IBlobStorage, MinioBlobStorage>();
    builder.Services.AddSingleton<IShareRepository, PostgresShareRepository>();
    builder.Services.AddSingleton<IRateLimiter, ValkeyRateLimiter>();

    // JSON: explicit options so we can lock down behaviour.
    builder.Services.ConfigureHttpJsonOptions(json =>
    {
        json.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        json.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

    // ─── Build + middleware ─────────────────────────────────────
    var app = builder.Build();

    app.UseSerilogRequestLogging(opts =>
    {
        opts.MessageTemplate = "HTTP {RequestMethod} {RequestPath} -> {StatusCode} in {Elapsed:0} ms";
        opts.GetLevel = (httpCtx, elapsed, ex) =>
            ex is not null
                ? Serilog.Events.LogEventLevel.Error
                : httpCtx.Response.StatusCode >= 500
                    ? Serilog.Events.LogEventLevel.Error
                    : httpCtx.Response.StatusCode >= 400
                        ? Serilog.Events.LogEventLevel.Warning
                        : Serilog.Events.LogEventLevel.Information;
    });

    // Prometheus middleware — exposes /metrics and instruments default counters.
    app.UseHttpMetrics();
    app.MapMetrics("/metrics");

    // ─── Endpoints ──────────────────────────────────────────────
    HealthEndpoint.Map(app);
    UploadEndpoint.Map(app);
    DownloadEndpoint.Map(app);
    DeleteEndpoint.Map(app);

    Log.Information("Listening on port {Port}", options.Port);
    await app.RunAsync().ConfigureAwait(false);
    return 0;
}
catch (Exception ex)
{
    Log.Fatal(ex, "Host terminated unexpectedly");
    return 1;
}
finally
{
    await Log.CloseAndFlushAsync().ConfigureAwait(false);
}

// ─── Helpers ─────────────────────────────────────────────────────
static IngestOptions LoadOptionsFromEnvironment()
{
    var port = ParsePort(
        Environment.GetEnvironmentVariable("INGEST_PORT")
        ?? ExtractPortFromUrls(Environment.GetEnvironmentVariable("ASPNETCORE_URLS"))
        ?? "3023");

    return new IngestOptions
    {
        Port = port,
        DatabaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL") ?? "",
        MinioEndpoint = Environment.GetEnvironmentVariable("MINIO_ENDPOINT") ?? "",
        MinioAccessKey = Environment.GetEnvironmentVariable("MINIO_ACCESS_KEY") ?? "",
        MinioSecretKey = Environment.GetEnvironmentVariable("MINIO_SECRET_KEY") ?? "",
        MinioBucket = Environment.GetEnvironmentVariable("MINIO_BUCKET") ?? "slothbox-blobs",
        MinioRegion = Environment.GetEnvironmentVariable("MINIO_REGION") ?? "eu-central-1",
        MinioUseSsl = ParseBool(Environment.GetEnvironmentVariable("MINIO_USE_SSL")),
        RedisUrl = Environment.GetEnvironmentVariable("REDIS_URL") ?? "",
        InternalToken = Environment.GetEnvironmentVariable("INTERNAL_TOKEN") ?? "",
    };
}

static int ParsePort(string raw) =>
    int.TryParse(raw, out var p) && p is > 0 and < 65_536 ? p : 3023;

static bool ParseBool(string? raw) =>
    raw is not null &&
    (raw.Equals("true", StringComparison.OrdinalIgnoreCase) ||
     raw == "1" ||
     raw.Equals("yes", StringComparison.OrdinalIgnoreCase));

/// <summary>
/// Pull the port out of an ASPNETCORE_URLS value like "http://+:3023". Returns
/// null when not parseable so the caller can fall through to the default.
/// </summary>
static string? ExtractPortFromUrls(string? urls)
{
    if (string.IsNullOrEmpty(urls))
    {
        return null;
    }

    foreach (var url in urls.Split(';', StringSplitOptions.RemoveEmptyEntries))
    {
        var idx = url.LastIndexOf(':');
        if (idx >= 0 && idx < url.Length - 1)
        {
            var portPart = url[(idx + 1)..].TrimEnd('/');
            if (int.TryParse(portPart, out _))
            {
                return portPart;
            }
        }
    }

    return null;
}

/// <summary>
/// Marker so trim/aot analysis sees Program is the entry point even when the
/// top-level statement form is used. No-op at runtime.
/// </summary>
public partial class Program { }
