// SlothBox.Ingest — DELETE /chunk/{shortId}/{chunkIndex} (internal-only).
//
// Used by the reaper daemon to GC chunks after burn / expiry / abuse takedown.
// Authenticated via X-Internal-Token using constant-time comparison.

using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Prometheus;
using SlothBox.Ingest.Configuration;
using SlothBox.Ingest.Services;

namespace SlothBox.Ingest.Endpoints;

/// <summary>
/// DELETE /chunk/{shortId}/{chunkIndex} — internal-only chunk reaper hook.
/// </summary>
public static class DeleteEndpoint
{
    private static readonly Counter ChunksDeleted = Metrics.CreateCounter(
        "slothbox_ingest_chunks_deleted_total",
        "Number of internal chunk deletions, labeled by outcome.",
        new CounterConfiguration { LabelNames = new[] { "result" } });

    /// <summary>Wire the route.</summary>
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapDelete("/chunk/{shortId}/{chunkIndex:int}", HandleAsync)
            .WithName("DeleteChunk")
            .WithDescription("Internal: delete a chunk's blob. Requires X-Internal-Token.");
    }

    private static async Task<IResult> HandleAsync(
        string shortId,
        int chunkIndex,
        HttpContext httpContext,
        IBlobStorage blobs,
        IOptions<IngestOptions> options,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger("DeleteEndpoint");
        using var scope = logger.BeginScope(new Dictionary<string, object>
        {
            ["shortId"] = shortId,
            ["chunkIndex"] = chunkIndex,
        });

        // Constant-time check on the shared secret. We avoid string.Equals because
        // it may short-circuit on length / first-byte mismatch.
        if (!IsAuthorized(httpContext, options.Value.InternalToken))
        {
            ChunksDeleted.WithLabels("unauthorized").Inc();
            // Identical 401 for "no header" and "bad token" — don't leak which.
            return Results.Unauthorized();
        }

        if (chunkIndex < 0)
        {
            ChunksDeleted.WithLabels("bad_index").Inc();
            return Results.BadRequest(new { error = "chunk_index_out_of_range" });
        }

        var blobKey = UploadEndpoint.BuildBlobKey(shortId, chunkIndex);

        try
        {
            await blobs.DeleteAsync(blobKey, ct).ConfigureAwait(false);
            ChunksDeleted.WithLabels("ok").Inc();
            return Results.NoContent();
        }
        catch (Exception ex)
        {
            ChunksDeleted.WithLabels("storage_error").Inc();
            logger.LogError(ex, "MinIO DeleteAsync failed for blob {BlobKey}", blobKey);
            return Results.StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    /// <summary>
    /// Verify X-Internal-Token using constant-time comparison so a token-guessing
    /// attacker can't time-side-channel us into leaking byte-by-byte matches.
    /// </summary>
    private static bool IsAuthorized(HttpContext httpContext, string expected)
    {
        if (!httpContext.Request.Headers.TryGetValue("X-Internal-Token", out var values) ||
            values.Count == 0)
        {
            return false;
        }

        var presented = values[0];
        if (string.IsNullOrEmpty(presented))
        {
            return false;
        }

        // FixedTimeEquals requires equal-length spans. We hash both sides to a
        // fixed length so length differences themselves can't leak anything.
        Span<byte> a = stackalloc byte[32];
        Span<byte> b = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(presented), a);
        SHA256.HashData(Encoding.UTF8.GetBytes(expected), b);

        return CryptographicOperations.FixedTimeEquals(a, b);
    }
}
