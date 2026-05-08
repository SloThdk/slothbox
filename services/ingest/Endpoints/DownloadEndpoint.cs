// SlothBox.Ingest — GET /chunk/{shortId}/{chunkIndex} handler.
//
// Streams the ciphertext from MinIO directly into the response body. The nonce
// is sent as a base64url header (X-Slothbox-Nonce); the body is the raw ciphertext.
//
// Download counting + burn-after-read trigger (CURRENT MODEL, post-migration 0004):
//   After `stream.CopyToAsync` returns successfully — i.e. once the bytes
//   have physically left the server — we call the `mark_chunk_served`
//   SQL function via IShareRepository.MarkChunkServedAsync. That function:
//     1. Locks the parent shares row (FOR UPDATE).
//     2. Stamps share_chunks.served_at and bumps served_count for THIS chunk.
//     3. If the share is burn_after_read AND state='ready' AND every chunk
//        now has served_at set, atomically flips state → 'destroyed',
//        sets destroyed_reason='burn', bumps download_count, and appends a
//        share_destroyed entry to the audit chain.
//   The function is idempotent: parallel chunk completions, retries, and
//   the gateway's separate /downloaded path can race in any order; only
//   the first call that finds state='ready' fires the burn.
//
//   The reaper's existing 60 s sweep picks up state='destroyed' shares
//   that still have share_chunks rows and removes the MinIO blobs. Until
//   that next sweep, the share's metadata returns 404 from the gateway
//   and the chunk endpoint returns 410 Gone (CanServeDownloads is false
//   on destroyed shares).
//
// Why ingest, not the gateway:
//   The gateway's /downloaded endpoint is a client-cooperative signal —
//   the recipient's browser politely posts to it after a successful
//   client-side decrypt. A hostile recipient (browser console intercept,
//   curl loop, non-browser client) can simply skip that POST, leaving
//   the share `state = 'ready'` until its TTL. The fix lives here in
//   ingest because ingest is the only service that actually knows when
//   bytes left the server. The gateway endpoint stays in place as a
//   no-op signal for legacy clients but is no longer load-bearing.
//
// What this DOES NOT defend against (v0.1 trust-model honesty):
//   Two simultaneous readers in parallel — say a legitimate recipient
//   AND a wiretap on transit who both have the URL — can both complete
//   their downloads if their chunk fetches interleave such that each
//   chunk is served at least once before any one chunk finishes "last".
//   Once the first byte of a chunk leaves the server, you can't unsend
//   it. The defence against THAT case is single-use HMAC chunk tokens
//   (planned for v0.5 alongside the auth + dashboard milestone — see
//   shares.ts:138-141 buildUploadUrl TODO).

using Microsoft.AspNetCore.Http;
using Prometheus;
using SlothBox.Ingest.Models;
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

    private static readonly Counter BurnFiredTotal = Metrics.CreateCounter(
        "slothbox_ingest_burn_fired_total",
        "Number of times a chunk-served event atomically triggered burn-after-read.");

    private static readonly Counter MarkServedFailures = Metrics.CreateCounter(
        "slothbox_ingest_mark_served_failed_total",
        "Number of times mark_chunk_served threw — bytes left successfully but the bookkeeping write failed. The next sweep + retry will reconcile.");

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

        // Bytes have physically left the server. Record the delivery and
        // — if this happened to be the last unserved chunk on a
        // burn-after-read share — fire the burn atomically inside the
        // SQL function. We deliberately do NOT make this part of the
        // user-visible response: the client got their chunk, and any
        // bookkeeping failure here is a server-side reconciliation
        // problem, not a download error.
        try
        {
            var marked = await shares
                .MarkChunkServedAsync(share.Id, chunkIndex, ct)
                .ConfigureAwait(false);

            if (marked.BurnFired)
            {
                BurnFiredTotal.Inc();
                logger.LogInformation(
                    "burn-after-read fired on share {ShareId} via chunk {ChunkIndex} delivery (audit_id={AuditId})",
                    share.Id, chunkIndex, marked.AuditId);
            }
            else if (marked.ShareState != ShareState.Ready)
            {
                // The share went terminal between when we started serving
                // this chunk and when we marked delivery — almost always
                // because either (a) the gateway's /downloaded path raced
                // us and won, or (b) a parallel chunk's mark_chunk_served
                // call won. Either way, no action needed; the row is
                // already in the right state. Log at debug only — info
                // would be too noisy under burst delivery.
                logger.LogDebug(
                    "chunk {ChunkIndex} on share {ShareId} delivered after share went {State}",
                    chunkIndex, share.Id, marked.ShareState);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Client disconnected after the body was sent but before our
            // bookkeeping committed. Bytes still left the server, so the
            // burn decision is unsafe to skip — but we can't block the
            // shutdown path either. Log loud and let the next chunk's
            // mark_chunk_served call (or the reaper's expiry sweep) catch
            // up.
            MarkServedFailures.Inc();
            logger.LogWarning(
                "mark_chunk_served cancelled for share {ShareId} chunk {ChunkIndex} after successful body send",
                share.Id, chunkIndex);
        }
        catch (Exception ex)
        {
            MarkServedFailures.Inc();
            logger.LogError(ex,
                "mark_chunk_served failed for share {ShareId} chunk {ChunkIndex} after successful body send — will reconcile on next chunk delivery or reaper sweep",
                share.Id, chunkIndex);
        }

        return Results.Empty;
    }

    /// <summary>Encode bytes as base64url (RFC 4648 §5) without padding.</summary>
    internal static string EncodeBase64Url(byte[] data)
    {
        var b64 = Convert.ToBase64String(data);
        return b64.TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
