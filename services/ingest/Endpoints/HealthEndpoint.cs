// SlothBox.Ingest — GET /healthz handler.
//
// Returns 200 with a JSON body when all three dependencies (Postgres, MinIO,
// Valkey) are reachable; 503 otherwise. Each dependency is probed in parallel
// so a slow Valkey doesn't make the response time stack with a slow Postgres.

using Microsoft.AspNetCore.Http;
using SlothBox.Ingest.Services;

namespace SlothBox.Ingest.Endpoints;

/// <summary>
/// GET /healthz.
/// </summary>
public static class HealthEndpoint
{
    private const string ServiceName = "ingest";
    private const string Version = "0.2.5";

    /// <summary>Wire the route.</summary>
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/healthz", HandleAsync)
            .WithName("Health")
            .WithDescription("Returns 200 when ingest + Postgres + MinIO + Valkey are reachable.");
    }

    private static async Task<IResult> HandleAsync(
        IShareRepository shares,
        IBlobStorage blobs,
        IRateLimiter limiter,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger("HealthEndpoint");

        // Run the three probes concurrently so the response is bounded by the
        // slowest dependency, not the sum.
        var pgTask = shares.HealthCheckAsync(ct);
        var minioTask = blobs.HealthCheckAsync(ct);
        var valkeyTask = limiter.HealthCheckAsync(ct);

        await Task.WhenAll(pgTask, minioTask, valkeyTask).ConfigureAwait(false);

        var pgOk = pgTask.Result;
        var minioOk = minioTask.Result;
        var valkeyOk = valkeyTask.Result;
        var allOk = pgOk && minioOk && valkeyOk;

        if (!allOk)
        {
            logger.LogWarning(
                "Health check failed — postgres={PgOk} minio={MinioOk} valkey={ValkeyOk}",
                pgOk, minioOk, valkeyOk);
        }

        var payload = new
        {
            status = allOk ? "ok" : "degraded",
            service = ServiceName,
            version = Version,
            checks = new
            {
                postgres = pgOk ? "ok" : "fail",
                minio = minioOk ? "ok" : "fail",
                valkey = valkeyOk ? "ok" : "fail",
            },
        };

        return Results.Json(
            payload,
            statusCode: allOk ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
    }
}
