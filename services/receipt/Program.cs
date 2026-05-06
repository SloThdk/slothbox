// SlothBox.Receipt — service entry point.
//
// v0.1.0-alpha.1 SKELETON
// ───────────────────────
// Boots a minimal-API host that:
//   * Reads RECEIPT_PORT, RECEIPT_TSA_URL, DATABASE_URL, LOG_LEVEL from env.
//   * Validates the bound options at startup (fail-fast).
//   * Listens on 0.0.0.0:RECEIPT_PORT (default 3024).
//   * Logs structured JSON via Serilog.
//   * Exposes /healthz, /metrics, /receipt/*, /audit/anchors/*.
//   * Suppresses the `Server: Kestrel` header.
//
// The receipt issuer + Merkle log are wired into DI as STUBS that throw on
// call — the HTTP layer short-circuits to 501 before reaching them. The
// dependency graph is identical to v0.5 so the flip is a single-line change.

using System.Globalization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Prometheus;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;
using SlothBox.Receipt.Configuration;
using SlothBox.Receipt.Endpoints;
using SlothBox.Receipt.Services;

// ─── Bootstrap logger ──────────────────────────────────────────────────
// A console-only Serilog logger active before host configuration so any
// startup-time crash is logged in the same JSON format as steady-state.
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.WithProperty("service", HealthEndpoint.ServiceName)
    .Enrich.WithProperty("version", HealthEndpoint.ServiceVersion)
    .WriteTo.Console(new CompactJsonFormatter())
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ─── Configuration: env → ReceiptOptions ───────────────────────────
    // Map flat UPPER_SNAKE_CASE env vars into a nested IConfiguration shape
    // that the Options binder understands. Done in-memory so existing
    // appsettings*.json files (none today) still take precedence if added.
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        [$"{ReceiptOptions.SectionName}:Port"] = Environment.GetEnvironmentVariable("RECEIPT_PORT"),
        [$"{ReceiptOptions.SectionName}:TsaUrl"] = Environment.GetEnvironmentVariable("RECEIPT_TSA_URL"),
        [$"{ReceiptOptions.SectionName}:DatabaseUrl"] = Environment.GetEnvironmentVariable("DATABASE_URL"),
        [$"{ReceiptOptions.SectionName}:LogLevel"] = Environment.GetEnvironmentVariable("LOG_LEVEL"),
        [$"{ReceiptOptions.SectionName}:TsaTimeoutSeconds"] = Environment.GetEnvironmentVariable("RECEIPT_TSA_TIMEOUT_SECONDS"),
    });

    builder.Services
        .AddOptions<ReceiptOptions>()
        .Bind(builder.Configuration.GetSection(ReceiptOptions.SectionName))
        .ValidateDataAnnotations()
        .ValidateOnStart();

    // Resolve once for Kestrel + Serilog wire-up below. If the env is
    // invalid, ValidateOnStart will fail-fast on host build.
    var bootstrapOptions = new ReceiptOptions
    {
        Port = ParseIntOr("RECEIPT_PORT", 3024),
        TsaUrl = Environment.GetEnvironmentVariable("RECEIPT_TSA_URL") ?? "https://freetsa.org/tsr",
        DatabaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL") ?? string.Empty,
        LogLevel = Environment.GetEnvironmentVariable("LOG_LEVEL") ?? "Information",
        TsaTimeoutSeconds = ParseIntOr("RECEIPT_TSA_TIMEOUT_SECONDS", 30),
    };

    // ─── Serilog (structured JSON) ─────────────────────────────────────
    builder.Host.UseSerilog((ctx, _, cfg) =>
    {
        LogEventLevel level = ParseLevel(bootstrapOptions.LogLevel);
        cfg.MinimumLevel.Is(level)
           .Enrich.WithProperty("service", HealthEndpoint.ServiceName)
           .Enrich.WithProperty("version", HealthEndpoint.ServiceVersion)
           .Enrich.FromLogContext()
           .WriteTo.Console(new CompactJsonFormatter());
    });

    // ─── Kestrel ───────────────────────────────────────────────────────
    // Bind on 0.0.0.0:port and strip the Server header (default Kestrel
    // adds `Server: Kestrel` — leak nothing extra).
    builder.WebHost.ConfigureKestrel(options =>
    {
        options.AddServerHeader = false;
        options.ListenAnyIP(bootstrapOptions.Port);
    });

    // ─── Forwarded headers (Caddy reverse-proxy) ───────────────────────
    // Caddy terminates TLS and forwards X-Forwarded-{For,Proto,Host}.
    // Trust those when running inside the compose `internal` network.
    builder.Services.Configure<ForwardedHeadersOptions>(opts =>
    {
        opts.ForwardedHeaders = ForwardedHeaders.XForwardedFor
                              | ForwardedHeaders.XForwardedProto
                              | ForwardedHeaders.XForwardedHost;
        opts.KnownNetworks.Clear();
        opts.KnownProxies.Clear();
    });

    // ─── Health checks ─────────────────────────────────────────────────
    // v0.1: probe Postgres if a DATABASE_URL is configured. The probe is
    // tagged `db` so /healthz can surface which dependency is failing.
    var healthBuilder = builder.Services.AddHealthChecks();
    if (!string.IsNullOrWhiteSpace(bootstrapOptions.DatabaseUrl))
    {
        healthBuilder.AddNpgSql(
            connectionString: ConvertToNpgsqlConnectionString(bootstrapOptions.DatabaseUrl),
            name: "postgres",
            tags: new[] { "db", "ready" });
    }

    // ─── Domain services ──────────────────────────────────────────────
    // Stubs throw NotImplementedException; the HTTP layer short-circuits
    // to 501 before reaching them. v0.5 swaps these registrations.
    builder.Services.AddSingleton<IReceiptIssuer, StubReceiptIssuer>();
    builder.Services.AddSingleton<IMerkleLog, StubMerkleLog>();

    // ─── Build host ───────────────────────────────────────────────────
    var app = builder.Build();

    app.UseSerilogRequestLogging(); // structured per-request log line
    app.UseForwardedHeaders();
    app.UseRouting();
    app.UseHttpMetrics(); // prometheus-net request counters/histograms

    // ─── Endpoints ────────────────────────────────────────────────────
    app.MapHealthEndpoint();
    app.MapReceiptEndpoints();
    app.MapAnchorsEndpoints();
    app.MapMetrics(); // /metrics — Prometheus scrape

    Log.Information(
        "SlothBox.Receipt {Version} listening on 0.0.0.0:{Port} (env: {Env})",
        HealthEndpoint.ServiceVersion,
        bootstrapOptions.Port,
        builder.Environment.EnvironmentName);

    await app.RunAsync().ConfigureAwait(false);
    return 0;
}
catch (Exception ex)
{
    Log.Fatal(ex, "SlothBox.Receipt host terminated unexpectedly");
    return 1;
}
finally
{
    await Log.CloseAndFlushAsync().ConfigureAwait(false);
}

// ─── Local helpers ─────────────────────────────────────────────────────

static int ParseIntOr(string envName, int fallback)
{
    string? raw = Environment.GetEnvironmentVariable(envName);
    if (string.IsNullOrWhiteSpace(raw))
    {
        return fallback;
    }
    return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int parsed)
        ? parsed
        : fallback;
}

static LogEventLevel ParseLevel(string raw)
{
    // Tolerate common shorthand ("info", "warn") in addition to the canonical
    // Serilog level names.
    return raw.Trim().ToLowerInvariant() switch
    {
        "verbose" or "trace" => LogEventLevel.Verbose,
        "debug" => LogEventLevel.Debug,
        "information" or "info" => LogEventLevel.Information,
        "warning" or "warn" => LogEventLevel.Warning,
        "error" or "err" => LogEventLevel.Error,
        "fatal" or "critical" => LogEventLevel.Fatal,
        _ => LogEventLevel.Information,
    };
}

// Convert a libpq URI (postgresql://user:pass@host:port/db) to the
// keyword/value form Npgsql expects (Host=...;Port=...;Username=...;
// Password=...;Database=...). Npgsql 8 actually accepts the URI form
// directly, but older versions did not — converting once at startup keeps
// us forward-compatible without depending on undocumented behaviour.
static string ConvertToNpgsqlConnectionString(string raw)
{
    if (!raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)
        && !raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
    {
        // Already a keyword/value string — pass through unchanged.
        return raw;
    }

    var uri = new Uri(raw);
    string user = Uri.UnescapeDataString(uri.UserInfo.Split(':')[0]);
    string password = uri.UserInfo.Contains(':', StringComparison.Ordinal)
        ? Uri.UnescapeDataString(uri.UserInfo[(uri.UserInfo.IndexOf(':', StringComparison.Ordinal) + 1)..])
        : string.Empty;
    string database = uri.AbsolutePath.TrimStart('/');

    return string.Create(CultureInfo.InvariantCulture, $"Host={uri.Host};Port={(uri.Port == -1 ? 5432 : uri.Port)};Username={user};Password={password};Database={database};SSL Mode=Prefer;Trust Server Certificate=true");
}

/// <summary>
/// Public marker type so WebApplicationFactory&lt;Program&gt; can target this
/// assembly in v0.5 integration tests. .NET 8 top-level Program is
/// <c>internal</c> by default — this re-declaration makes it accessible
/// without changing the SDK behaviour.
/// </summary>
public partial class Program;
