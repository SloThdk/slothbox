// SlothBox.Ingest — GET /chunk/{shortId}/{chunkIndex} handler.
//
// Streams the ciphertext from MinIO directly into the response body. The nonce
// is sent as a base64url header (X-Slothbox-Nonce); the body is the raw ciphertext.
//
// Download counting model (DOCUMENTED DECISION):
//   The api-gateway is the canonical place to bump shares.download_count via
//   the increment_download(short_id) RPC. Ingest does NOT touch download_count
//   itself, because:
//     * one logical "download" = chunkCount HTTP fetches; bumping per-chunk
//       would over-count by chunkCount
//     * burn-after-read should fire exactly ONCE per receiver session, and the
//       gateway is the single point where we can know "this is the last GET"
//   The gateway calls the RPC after the receiver-side decryption succeeds and
//   the file has been delivered to the user, not when the last byte left ingest.

using Microsoft.AspNetCore.Http;
using Prometheus;
using SlothBox.Ingest.Services;

namespace SlothBox.Ingest.Endpoints;

/// <summary>
/// GET /chunk/{shortId}/{chunkIndex}.
/// </summary>
public static class DownloadEndpoint
{
    private static readonly Counter ChunksServed = Metrics.CreateCounter(
        "slothbox_ingest_chunks_served_total",
        "Number of chunk download responses, labeled by outcome.",
        new CounterConfiguration { LabelNames = new[] { "result" } });

    private static readonly Histogram DownloadBytes = Metrics.CreateHistogram(
        "slothbox_ingest_chunk_download_bytes",
        "Ciphertext bytes per served chunk.",
        new HistogramConfiguration
        {
            Buckets = Histogram.ExponentialBuckets(start: 1024, factor: 2, count: 15),
        });

    private static readonly Histogram DownloadDuration = Metrics.CreateHistogram(
        "slothbox_ingest_chunk_download_duration_seconds",
        "Wall-clock time per chunk download response.");

    /// <summary>Wire the route.</summary>
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/chunk/{shortId}/{chunkIndex:int}", HandleAsync)
            .WithName("DownloadChunk")
            .WithDescription("Stream a single ciphertext chunk back to the client.");
    }

    /// <summary>Returns 200 with raw ciphertext, 404 / 410 / 502 otherwise.</summary>
    private static async Task<IResult> HandleAsync(
        string shortId,
        int chunkIndex,
        HttpContext httpContext,
        IShareRepository shares,
        IBlobStorage blobs,
        IRateLimiter limiter,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger("DownloadEndpoint");
        using var scope = logger.BeginScope(new Dictionary<string, object>
        {
            ["shortId"] = shortId,
            ["chunkIndex"] = chunkIndex,
        });

        using var timer = DownloadDuration.NewTimer();

        // Rate limit per share: more generous than uploads since chunks are read
        // many times in fast succession.
        var rateOk = await limiter.TryAcquireAsync(
            $"ingest:get:{shortId}",
            limit: 5000,
            windowSeconds: 60,
            ct).ConfigureAwait(false);
        if (!rateOk)
        {
            ChunksServed.WithLabels("rate_limited").Inc();
            return Results.StatusCode(StatusCodes.Status429TooManyRequests);
        }

        // Resolve share + chunk.
        var share = await shares.GetShareByShortIdAsync(shortId, ct).ConfigureAwait(false);
        if (share is null)
        {
            ChunksServed.WithLabels("share_not_found").Inc();
            return Results.NotFound(new { error = "share_not_found" });
        }

        if (!share.CanServeDownloads || share.IsExpired)
        {
            ChunksServed.WithLabels("not_servable").Inc();
            return Results.StatusCode(StatusCodes.Status410Gone);
        }

        if (chunkIndex < 0 || chunkIndex >= share.ChunkCount)
        {
            ChunksServed.WithLabels("bad_index").Inc();
            return Results.BadRequest(new { error = "chunk_index_out_of_range" });
        }

        var chunk = await shares.GetChunkAsync(share.Id, chunkIndex, ct).ConfigureAwait(false);
        if (chunk is null)
        {
            ChunksServed.WithLabels("chunk_not_found").Inc();
            return Results.NotFound(new { error = "chunk_not_found" });
        }

        // Set response headers BEFORE writing the body — once the first byte goes
        // out, headers are frozen.
        httpContext.Response.StatusCode = StatusCodes.Status200OK;
        httpContext.Response.ContentType = "application/octet-stream";
        httpContext.Response.ContentLength = chunk.CiphertextSize;
        httpContext.Response.Headers["X-Slothbox-Nonce"] = EncodeBase64Url(chunk.Nonce);
        httpContext.Response.Headers["Cache-Control"] = "no-store";
        httpContext.Response.Headers["X-Content-Type-Options"] = "nosniff";

        try
        {
            // Stream MinIO -> response body. The blob storage GetAsync calls our
            // writer with a stream; we copy to the response, which is itself
            // backed by Kestrel's PipeWriter. End-to-end zero-copy via Pipelines.
            await blobs.GetAsync(chunk.BlobKey, async (stream, innerCt) =>
            {
                await stream.CopyToAsync(httpContext.Response.Body, bufferSize: 81_920, innerCt)
                    .ConfigureAwait(false);
            }, ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            ChunksServed.WithLabels("client_cancelled").Inc();
            throw;
        }
        catch (Exception ex)
        {
            ChunksServed.WithLabels("storage_error").Inc();
            logger.LogError(ex, "MinIO GetAsync failed for blob {BlobKey}", chunk.BlobKey);

            // If we haven't started the response yet, we can still send a 502.
            // If we have, the connection is already poisoned and the client
            // will see a truncated body — the best we can do is log and tear down.
            if (!httpContext.Response.HasStarted)
            {
                return Results.StatusCode(StatusCodes.Status502BadGateway);
            }

            httpContext.Abort();
            return Results.Empty;
        }

        ChunksServed.WithLabels("ok").Inc();
        DownloadBytes.Observe(chunk.CiphertextSize);
        return Results.Empty;
    }

    /// <summary>Encode bytes as base64url (RFC 4648 §5) without padding.</summary>
    internal static string EncodeBase64Url(byte[] data)
    {
        var b64 = Convert.ToBase64String(data);
        return b64.TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
