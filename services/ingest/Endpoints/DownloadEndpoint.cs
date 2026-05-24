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
// Chunk-token regime (v0.2 migration 0007; v0.2.7 burn-only scoping):
//   Each chunk uploaded after migration 0007 carries a 32-byte SHA-256
//   commitment of a client-derived single-use download token. The
//   recipient presents the raw token as `Authorization: Bearer …`;
//   we hash incoming and constant-time compare against the stored
//   commitment. The token gate establishes per-request that the
//   requester knows the URL-fragment key — it fires on EVERY chunk
//   request, first delivery or retry.
//
//   v0.2.7 behaviour change: the single-use enforcement (return 410
//   when served_at is already set) is now SCOPED to burn-after-read
//   shares. Non-burn shares allow re-downloads of the same chunk as
//   long as the share is in a servable state and not expired — the
//   recipient can re-open the link until expires_at, which matches
//   what the sender's "burn after reading" checkbox semantically
//   implies. Previously the 410 fired for every share regardless of
//   the burn flag, which broke legitimate retries (flaky connection,
//   browser auto-save fail, recipient re-opens link), and the
//   parallel-reader defence it provided was illusory anyway: in v0.1
//   the auth model is "knowledge of shortId + URL-fragment key
//   equals authorisation", so an attacker who intercepted the link
//   can re-fetch indefinitely regardless of token-burn enforcement.
//
//   For burn-after-read shares the original behaviour stands: the
//   first complete chunk delivery flips served_at, the last chunk to
//   land triggers state='destroyed' atomically via mark_chunk_served,
//   and any subsequent fetch returns 410. This is the spec for burn.
//
//   Legacy chunks (uploaded before migration 0007) have NULL
//   download_token_hash. Those rows bypass the token check and
//   serve under v0.1 semantics — preserved for back-compat through
//   the in-flight expiry window after the migration runs.

using System.Security.Cryptography;
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
        // shortId regex constraint mirrors the gateway's
        // SHORT_ID_ALPHABET; see UploadEndpoint.Map for the rationale
        // (audit Finding #6 -- defence-in-depth before MinIO key build).
        app.MapGet("/chunk/{shortId:regex(^[abcdefghjkmnpqrstuvwxyz23456789]{{12}}$)}/{chunkIndex:int}", HandleAsync)
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

        // Chunk-token validation (v0.2, migration 0007; v0.2.7 burn-only scoping).
        //
        // Four states:
        //   1. ServedAt is non-null AND share is burn-after-read
        //      → 410 Gone. Burn-after-read shares are single-download
        //        by spec; the served_at stamp closes the chunk for
        //        good. Returning 410 (not 403) tells a polite client
        //        the chunk is permanently unavailable.
        //   2. ServedAt is non-null AND share is NOT burn-after-read
        //      → fall through to token validation + serve. The recipient
        //        is allowed to re-download within the share's TTL window
        //        because they did not opt into burn-after-read semantics.
        //   3. DownloadTokenHash is non-null
        //      → token gate applies on EVERY request (first or retry).
        //        Require Authorization: Bearer with a 32-byte raw token
        //        that hashes (SHA-256) to the stored commitment.
        //          - missing/malformed → 401
        //          - hash mismatch → 403
        //          - valid → fall through to serve
        //   4. DownloadTokenHash is null (legacy chunk, pre-0007)
        //      → no token required, serve under v0.1 semantics.
        if (chunk.ServedAt is not null && share.BurnAfterRead)
        {
            ChunksServed.WithLabels("already_served").Inc();
            return Results.StatusCode(StatusCodes.Status410Gone);
        }
        if (chunk.DownloadTokenHash is not null)
        {
            var incomingHash = ExtractChunkTokenHash(httpContext.Request.Headers["Authorization"]);
            if (incomingHash is null)
            {
                ChunksServed.WithLabels("missing_token").Inc();
                return Results.StatusCode(StatusCodes.Status401Unauthorized);
            }
            if (!CryptographicOperations.FixedTimeEquals(incomingHash, chunk.DownloadTokenHash))
            {
                ChunksServed.WithLabels("bad_token").Inc();
                return Results.StatusCode(StatusCodes.Status403Forbidden);
            }
            // Token valid — fall through to serve. For burn-after-read
            // shares the chunk row gets ServedAt stamped after
            // stream.CopyToAsync returns, at which point any concurrent
            // re-request will hit branch (1) above and receive 410.
            // For non-burn shares ServedAt may already be set from an
            // earlier successful delivery — re-downloads are by design.
        }

        // Set response headers BEFORE writing the body — once the first byte goes
        // out, headers are frozen.
        httpContext.Response.StatusCode = StatusCodes.Status200OK;
        httpContext.Response.ContentType = "application/octet-stream";
        httpContext.Response.ContentLength = chunk.CiphertextSize;
        httpContext.Response.Headers["X-Slothbox-Nonce"] = EncodeBase64Url(chunk.Nonce);
        httpContext.Response.Headers["Cache-Control"] = "no-store";
        httpContext.Response.Headers["X-Content-Type-Options"] = "nosniff";

        // ──────────────────────────────────────────────────────────────
        // served_at commitment timing — security boundary (burn shares)
        //
        // For burn-after-read shares, `served_at` is the single-use
        // gate: once stamped, every subsequent fetch of this chunk
        // returns 410. The commit must land BEFORE a second request
        // can race with the first. The naive shape (stream → then
        // mark) is attackable: a client that aborts the TCP connection
        // mid-body can poison `mark_chunk_served` (the await is
        // cancelled by the ambient `ct`) while the bytes that already
        // shipped are gone. A determined attacker could repeat this
        // and re-fetch the same chunk indefinitely, undermining the
        // burn semantics.
        //
        // Fix: wrap the stream in try/finally; in `finally`, if the
        // response had already started (any body byte flushed),
        // commit the mark with `CancellationToken.None` so the DB
        // write isn't cancelled by the same TCP-abort that triggered
        // entry. The mark runs exactly when "bytes physically left
        // the server" is true — regardless of whether the body
        // finished cleanly, was cancelled mid-flight, or errored on
        // a MinIO read after the headers were flushed.
        //
        // What this trades for burn shares: a legitimate recipient on
        // a flaky mobile connection who loses mid-stream cannot retry
        // — `served_at` is now set, the chunk returns 410 Gone, the
        // sender re-shares. That's the literal meaning of "burn after
        // reading" and the documented trade-off for the security
        // primitive.
        //
        // For non-burn shares (v0.2.7) the mark still runs but doesn't
        // gate re-downloads — recipients can retry freely within the
        // share's TTL. The mark is still useful: it records the first
        // delivery time and bumps served_count for sender-visible
        // download analytics.
        // ──────────────────────────────────────────────────────────────
        var bytesStartedLeaving = false;
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

            ChunksServed.WithLabels("ok").Inc();
            DownloadBytes.Observe(chunk.CiphertextSize);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            ChunksServed.WithLabels("client_cancelled").Inc();
            // finally below will commit the mark if the body had started.
            throw;
        }
        catch (Exception ex)
        {
            ChunksServed.WithLabels("storage_error").Inc();
            logger.LogError(ex, "MinIO GetAsync failed for blob {BlobKey}", chunk.BlobKey);

            // If we haven't started the response yet, we can still send a 502
            // AND skip the mark (the chunk is still retry-able).
            if (!httpContext.Response.HasStarted)
            {
                return Results.StatusCode(StatusCodes.Status502BadGateway);
            }

            // Response had started — the finally below will commit the mark
            // before we abort the connection. Recipient sees a truncated body
            // and a 410 on retry; sender re-shares.
            httpContext.Abort();
            return Results.Empty;
        }
        finally
        {
            // Detached check — `HasStarted` flips true after the first body
            // byte is flushed by Kestrel's PipeWriter, which happens inside
            // the `CopyToAsync` call above. If it's true, bytes physically
            // left this process and the single-use commitment must commit.
            bytesStartedLeaving = httpContext.Response.HasStarted;

            if (bytesStartedLeaving)
            {
                try
                {
                    // CancellationToken.None — we MUST commit even when the
                    // ambient request CT has been cancelled (the race window
                    // this whole block is closing). The mark is idempotent
                    // via the migration 0007 `served_at IS NULL` guard.
                    var marked = await shares
                        .MarkChunkServedAsync(share.Id, chunkIndex, CancellationToken.None)
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
                        // Share went terminal between when we started serving
                        // this chunk and when we marked delivery — usually a
                        // parallel chunk's `mark_chunk_served` call won the
                        // race. No action needed; the row is in the right
                        // state.
                        logger.LogDebug(
                            "chunk {ChunkIndex} on share {ShareId} delivered after share went {State}",
                            chunkIndex, share.Id, marked.ShareState);
                    }
                }
                catch (Exception ex)
                {
                    // Last-resort error path. CancellationToken.None means
                    // this catch should be unreachable in practice unless
                    // Postgres itself is unreachable — which the reaper's
                    // 60s sweep will reconcile on its next tick.
                    MarkServedFailures.Inc();
                    logger.LogError(ex,
                        "mark_chunk_served failed for share {ShareId} chunk {ChunkIndex} after bytes left the server — reaper will reconcile",
                        share.Id, chunkIndex);
                }
            }
        }

        return Results.Empty;
    }

    /// <summary>Encode bytes as base64url (RFC 4648 §5) without padding.</summary>
    internal static string EncodeBase64Url(byte[] data)
    {
        var b64 = Convert.ToBase64String(data);
        return b64.TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    /// <summary>
    /// Extract a bearer chunk-token from the Authorization header and
    /// return the SHA-256 hash of the raw token bytes — the value that
    /// gets timing-safe-compared against the stored
    /// share_chunks.download_token_hash.
    ///
    /// Returns null when the header is missing, malformed, the bearer
    /// scheme is wrong, the base64url decode fails, or the decoded
    /// length is not 32. The caller surfaces null as HTTP 401 with a
    /// generic message — no probe surface that distinguishes between
    /// "missing" and "decode failed".
    ///
    /// Why hash here and not pass raw bytes upstream:
    ///   Keeps the raw token out of every other code path's memory
    ///   immediately after parse. The only thing that ever touches
    ///   the raw token in the ingest service is this function;
    ///   everything downstream sees the hash.
    /// </summary>
    private static byte[]? ExtractChunkTokenHash(Microsoft.Extensions.Primitives.StringValues authHeader)
    {
        if (authHeader.Count == 0)
        {
            return null;
        }
        var value = authHeader[0];
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }
        // Require the exact "Bearer " prefix (case-sensitive per RFC 6750
        // §2.1, though we accept whitespace flexibility via TrimStart).
        const string prefix = "Bearer ";
        if (!value.StartsWith(prefix, StringComparison.Ordinal))
        {
            return null;
        }
        var raw = value.AsSpan(prefix.Length).TrimStart();
        if (raw.Length == 0)
        {
            return null;
        }
        if (!UploadEndpoint.TryDecodeBase64Url(raw.ToString(), out var rawBytes))
        {
            return null;
        }
        if (rawBytes.Length != 32)
        {
            return null;
        }
        // SHA-256 the raw token. Allocation-free path via
        // SHA256.HashData; output is a fresh 32-byte array.
        return SHA256.HashData(rawBytes);
    }
}
