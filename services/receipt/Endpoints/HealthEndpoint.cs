// SlothBox.Receipt — health endpoint mapping.
//
// /healthz returns:
//   200 OK   — service is healthy AND the database probe succeeds.
//   503      — degraded: service is up but a critical dependency is down.
//
// Body shape (200):
//   { "status": "ok", "service": "receipt", "version": "0.2.2" }
//
// Body shape (503):
//   {
//     "status": "degraded", "service": "receipt", "version": "0.2.2",
//     "checks": [ { "name": "postgres", "status": "Unhealthy", "error": "..." } ]
//   }
//
// HEAD requests are explicitly tolerated by ASP.NET Core's MapGet. Container
// healthchecks in docker-compose use `wget -qO-` (a GET) so the body shape
// matters — keep it stable.

using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace SlothBox.Receipt.Endpoints;

/// <summary>
/// Liveness + readiness endpoint mapping. The service version is the only
/// place we hard-code a string version; everything else (Dockerfile labels,
/// CI artefact names) reads from the assembly informational version.
/// </summary>
public static class HealthEndpoint
{
    /// <summary>
    /// Stable service identifier — used as <c>service</c> in the JSON body
    /// so log/metrics consumers can filter by it.
    /// </summary>
    public const string ServiceName = "receipt";

    /// <summary>
    /// Service version. The receipt service is a skeleton in v0.2.x (returns
    /// 501 for the issuance endpoints); the version still tracks the umbrella
    /// release so /healthz reports the same number as ingest + gateway.
    /// Full receipt issuance lands in v0.5.
    /// </summary>
    public const string ServiceVersion = "0.2.4";

    /// <summary>
    /// Wires the /healthz route. The underlying HealthCheckService is built
    /// by the host in <c>Program.cs</c>; this method only formats the
    /// response.
    /// </summary>
    public static IEndpointRouteBuilder MapHealthEndpoint(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/healthz", async (HttpContext ctx, HealthCheckService health, CancellationToken ct) =>
        {
            var sw = Stopwatch.StartNew();
            HealthReport report = await health.CheckHealthAsync(ct).ConfigureAwait(false);
            sw.Stop();

            // 503 on Degraded OR Unhealthy. Healthy is the only 200 path.
            int statusCode = report.Status == HealthStatus.Healthy
                ? StatusCodes.Status200OK
                : StatusCodes.Status503ServiceUnavailable;

            string statusText = report.Status switch
            {
                HealthStatus.Healthy => "ok",
                HealthStatus.Degraded => "degraded",
                _ => "unhealthy",
            };

            // Hand-rolled JSON to keep the body byte-stable across runtimes —
            // System.Text.Json's default ordering matches what we want, but
            // the spec for this endpoint is short enough that explicit beats
            // implicit.
            var body = new
            {
                status = statusText,
                service = ServiceName,
                version = ServiceVersion,
                durationMs = (long)sw.Elapsed.TotalMilliseconds,
                checks = report.Entries.Select(kv => new
                {
                    name = kv.Key,
                    status = kv.Value.Status.ToString(),
                    error = kv.Value.Exception?.Message,
                }),
            };

            ctx.Response.StatusCode = statusCode;
            await ctx.Response.WriteAsJsonAsync(body, ct).ConfigureAwait(false);
            return Results.Empty;
        })
        .WithName("Healthz")
        .WithDescription("Liveness + dependency readiness for the receipt service.")
        .ExcludeFromDescription();

        return routes;
    }
}
