// SlothBox.Ingest — PUT /chunk/{shortId}/{chunkIndex} handler.
//
// This is the hot path. Multi-GB ciphertext flows through here, so we:
//   * stream the body via PipeReader (never buffer in memory)
//   * cap body length at 10 MB (one chunk) to prevent zip-bomb behaviour
//   * cap nonce length at 24 bytes (XChaCha20-Poly1305) before any DB/MinIO work
//   * validate share state + chunkIndex range BEFORE touching MinIO
//   * use parameterised SQL throughout
//   * never log ciphertext bytes or nonce bytes
//
// Flow:
//   1. Resolve share by shortId        -> 404 if missing, 410 if non-uploadable state
//   2. Validate chunkIndex             -> 400 if out of range
//   3. Validate Content-Length         -> 400 if missing / too big / not matching chunkSize
//   4. Validate X-Slothbox-Nonce          -> 400 if missing / wrong length / not base64url
//   5. Stream body to MinIO            -> 502 on storage error
//   6. Upsert share_chunks row         -> 502 on DB error
//   7. If all chunks present, promote share state to 'ready'
//   8. Return 201 with metadata

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Prometheus;
using SlothBox.Ingest.Configuration;
using SlothBox.Ingest.Models;
using SlothBox.Ingest.Services;

namespace SlothBox.Ingest.Endpoints;

/// <summary>
/// PUT /chunk/{shortId}/{chunkIndex}.
/// </summary>
public static class UploadEndpoint
{
    // ─── Metrics ─────────────────────────────────────────────────
    private static readonly Counter ChunksUploaded = Metrics.CreateCounter(
        "slothbox_ingest_chunks_uploaded_total",
        "Number of chunks successfully uploaded.",
        new CounterConfiguration { LabelNames = new[] { "result" } });

    private static readonly Histogram UploadBytes = Metrics.CreateHistogram(
        "slothbox_ingest_chunk_upload_bytes",
        "Ciphertext bytes per uploaded chunk.",
        new HistogramConfiguration
        {
            // 1 KB → 16 MB exponential buckets.
            Buckets = Histogram.ExponentialBuckets(start: 1024, factor: 2, count: 15),
        });

    private static readonly Histogram UploadDuration = Metrics.CreateHistogram(
        "slothbox_ingest_chunk_upload_duration_seconds",
        "Wall-clock time per chunk upload, including MinIO write and DB upsert.");

    /// <summary>
    /// Wire the route.
    /// </summary>
    public static void Map(IEndpointRouteBuilder app)
    {
        var route = app.MapPut("/chunk/{shortId}/{chunkIndex:int}", HandleAsync)
            .WithName("UploadChunk")
            .WithDescription("Upload a single ciphertext chunk for a share.");

        // Per-endpoint body size limit. The global Kestrel cap is 10 MB; this is
        // belt-and-braces in case middleware strips the global one.
        route.WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(10 * 1024 * 1024));
    }

    /// <summary>
    /// Handler. Returns one of:
    ///   201 Created    — chunk stored, response body has metadata
    ///   400 BadRequest — header / size / nonce validation failed
    ///   404 NotFound   — share doesn't exist
    ///   410 Gone       — share exists but is not in an uploadable state
    ///   413 PayloadTooLarge — body exceeds chunk size cap
    ///   429 TooManyRequests — rate limit
    ///   502 BadGateway — MinIO / Postgres failure
    /// </summary>
    private static async Task<IResult> HandleAsync(
        string shortId,
        int chunkIndex,
        HttpContext httpContext,
        IShareRepository shares,
        IBlobStorage blobs,
        IRateLimiter limiter,
        IOptions<IngestOptions> options,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger("UploadEndpoint");
        using var scope = logger.BeginScope(new Dictionary<string, object>
        {
            ["shortId"] = shortId,
            ["chunkIndex"] = chunkIndex,
        });

        var opts = options.Value;
        using var timer = UploadDuration.NewTimer();

        // 0. Rate limit per share — 1000 chunk uploads / 60s is generous; the
        //    api-gateway runs a separate per-IP limit upstream.
        var rateOk = await limiter.TryAcquireAsync(
            $"ingest:put:{shortId}",
            limit: 1000,
            windowSeconds: 60,
            ct).ConfigureAwait(false);
        if (!rateOk)
        {
            ChunksUploaded.WithLabels("rate_limited").Inc();
            return Results.StatusCode(StatusCodes.Status429TooManyRequests);
        }

        // 1. Resolve the share.
        var share = await shares.GetShareByShortIdAsync(shortId, ct).ConfigureAwait(false);
        if (share is null)
        {
            ChunksUploaded.WithLabels("not_found").Inc();
            return Results.NotFound(new { error = "share_not_found" });
        }

        if (!share.CanAcceptUploads || share.IsExpired)
        {
            ChunksUploaded.WithLabels("not_uploadable").Inc();
            logger.LogInformation("Rejected upload — state {State}, expired={Expired}",
                share.State, share.IsExpired);
            return Results.StatusCode(StatusCodes.Status410Gone);
        }

        // 2. chunkIndex range check.
        if (chunkIndex < 0 || chunkIndex >= share.ChunkCount)
        {
            ChunksUploaded.WithLabels("bad_index").Inc();
            return Results.BadRequest(new { error = "chunk_index_out_of_range" });
        }

        // 3. Body size check. ContentLength is required — without it we can't
        //    pass the size to MinIO without buffering.
        var contentLength = httpContext.Request.ContentLength;
        if (contentLength is null || contentLength < 0)
        {
            ChunksUploaded.WithLabels("missing_length").Inc();
            return Results.BadRequest(new { error = "content_length_required" });
        }

        if (contentLength > opts.MaxChunkBytes)
        {
            ChunksUploaded.WithLabels("too_large").Inc();
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        // Per-share chunk-size enforcement: every chunk except the last must be
        // exactly chunkSize; the last chunk can be smaller (final tail of the file).
        var isLastChunk = chunkIndex == share.ChunkCount - 1;
        if (!isLastChunk && contentLength != share.ChunkSize)
        {
            ChunksUploaded.WithLabels("size_mismatch").Inc();
            return Results.BadRequest(new { error = "chunk_size_mismatch" });
        }
        if (isLastChunk && contentLength > share.ChunkSize)
        {
            ChunksUploaded.WithLabels("size_mismatch_last").Inc();
            return Results.BadRequest(new { error = "last_chunk_too_large" });
        }
        if (contentLength == 0)
        {
            ChunksUploaded.WithLabels("empty_body").Inc();
            return Results.BadRequest(new { error = "empty_chunk" });
        }

        // 4. Nonce header.
        if (!httpContext.Request.Headers.TryGetValue("X-Slothbox-Nonce", out var nonceHeaderValues) ||
            nonceHeaderValues.Count == 0)
        {
            ChunksUploaded.WithLabels("missing_nonce").Inc();
            return Results.BadRequest(new { error = "missing_nonce_header" });
        }

        var nonceHeader = nonceHeaderValues[0];
        if (string.IsNullOrEmpty(nonceHeader))
        {
            ChunksUploaded.WithLabels("missing_nonce").Inc();
            return Results.BadRequest(new { error = "missing_nonce_header" });
        }

        if (!TryDecodeBase64Url(nonceHeader, out var nonce) || nonce.Length != opts.NonceBytes)
        {
            ChunksUploaded.WithLabels("bad_nonce").Inc();
            return Results.BadRequest(new { error = "invalid_nonce" });
        }

        // 4a. Optional chunk token-hash header (migration 0007 / v0.2).
        //
        // When present, the value is the base64url SHA-256 of a
        // client-derived single-use download token; we store it on the
        // share_chunks row so the GET path can later compare an
        // incoming bearer token against it.
        //
        // When absent, the chunk is created with a NULL hash — the GET
        // path then treats this chunk as "no token required" and serves
        // it under the v0.1 semantics. This back-compat path covers:
        //   (a) older clients that don't know about chunk tokens
        //   (b) future server-side abuse tooling that uploads under a
        //       different identity model and skips the per-chunk token
        // The hash MUST decode to exactly 32 bytes when present — same
        // length as a SHA-256 digest, matching the CHECK constraint on
        // share_chunks.download_token_hash.
        byte[]? downloadTokenHash = null;
        if (httpContext.Request.Headers.TryGetValue(
                "X-Slothbox-Chunk-Token-Hash",
                out var tokenHashHeaderValues) && tokenHashHeaderValues.Count > 0)
        {
            var tokenHashHeader = tokenHashHeaderValues[0];
            if (string.IsNullOrEmpty(tokenHashHeader))
            {
                // Header present but empty — treat as malformed rather than
                // "absent", so a sender who tried to set the header and
                // accidentally sent "" gets a clear 400 instead of silently
                // falling through to the legacy path.
                ChunksUploaded.WithLabels("bad_token_hash").Inc();
                return Results.BadRequest(new { error = "empty_chunk_token_hash_header" });
            }
            if (!TryDecodeBase64Url(tokenHashHeader, out var decodedHash)
                || decodedHash.Length != 32)
            {
                ChunksUploaded.WithLabels("bad_token_hash").Inc();
                return Results.BadRequest(new { error = "invalid_chunk_token_hash" });
            }
            downloadTokenHash = decodedHash;
        }

        // 5. Stream body to MinIO via the request's PipeReader.
        var blobKey = BuildBlobKey(shortId, chunkIndex);
        var ciphertextSize = (int)contentLength.Value;

        try
        {
            // We expose the request's PipeReader as a Stream that streams directly
            // into MinIO. PipeReader.AsStream() gives a non-seekable ReadOnlyStream
            // that the SDK consumes lazily — no full-body buffer in memory.
            var bodyReader = httpContext.Request.BodyReader;
            await using var streamAdapter = bodyReader.AsStream(leaveOpen: true);

            await blobs.PutAsync(
                blobKey,
                streamAdapter,
                ciphertextSize,
                "application/octet-stream",
                ct).ConfigureAwait(false);
        }
        catch (BadHttpRequestException brex)
        {
            // Body length mismatch / disconnect — Kestrel surfaces these as
            // BadHttpRequestException. Treat as a 400, not a 500.
            ChunksUploaded.WithLabels("body_error").Inc();
            logger.LogWarning(brex, "Bad request body");
            return Results.BadRequest(new { error = "body_error" });
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Client disconnected — do NOT log ciphertext details.
            ChunksUploaded.WithLabels("cancelled").Inc();
            throw;
        }
        catch (Exception ex)
        {
            ChunksUploaded.WithLabels("storage_error").Inc();
            logger.LogError(ex, "MinIO PutAsync failed for blob {BlobKey}", blobKey);
            return Results.StatusCode(StatusCodes.Status502BadGateway);
        }

        var uploadedAt = DateTimeOffset.UtcNow;

        // 6. Upsert chunk row.
        try
        {
            await shares.UpsertChunkAsync(
                share.Id,
                chunkIndex,
                nonce,
                blobKey,
                ciphertextSize,
                uploadedAt,
                downloadTokenHash,
                ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            ChunksUploaded.WithLabels("db_error").Inc();
            logger.LogError(ex, "share_chunks upsert failed for share {ShareId}", share.Id);
            // The blob is on disk but the row isn't — the reaper will GC the
            // orphan when the share expires. Return 502 so the client retries.
            return Results.StatusCode(StatusCodes.Status502BadGateway);
        }

        // 7. Promote state to 'ready' if every chunk has now arrived. We move
        //    'pending' → 'uploading' on the first arrival and 'uploading' → 'ready'
        //    on the last. We don't bother with a transactional check-and-set: the
        //    api-gateway retries idempotently and an extra UPDATE is cheap.
        try
        {
            if (share.State == ShareState.Pending)
            {
                await shares.UpdateShareStateAsync(share.Id, ShareState.Uploading, ct)
                    .ConfigureAwait(false);
            }

            var uploaded = await shares.CountUploadedChunksAsync(share.Id, ct)
                .ConfigureAwait(false);
            if (uploaded >= share.ChunkCount)
            {
                await shares.UpdateShareStateAsync(share.Id, ShareState.Ready, ct)
                    .ConfigureAwait(false);
                logger.LogInformation("Share {ShareId} promoted to ready ({Uploaded}/{Total} chunks)",
                    share.Id, uploaded, share.ChunkCount);
            }
        }
        catch (Exception ex)
        {
            // Non-fatal — the chunk is stored. Log and let the next chunk's
            // upload (or a reaper sweep) re-evaluate the state.
            logger.LogWarning(ex, "Failed to update share state for {ShareId}; will retry on next upload",
                share.Id);
        }

        ChunksUploaded.WithLabels("ok").Inc();
        UploadBytes.Observe(ciphertextSize);

        return Results.Json(
            new ChunkUploadResponse(chunkIndex, blobKey, uploadedAt),
            statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// Object key convention: "{shortId}/{chunkIndex}". Stable so the GET path
    /// can recompute it without a DB lookup.
    /// </summary>
    internal static string BuildBlobKey(string shortId, int chunkIndex)
        => $"{shortId}/{chunkIndex}";

    /// <summary>
    /// Decode base64url (RFC 4648 §5) without padding. Returns false on invalid input.
    /// </summary>
    internal static bool TryDecodeBase64Url(string input, out byte[] decoded)
    {
        decoded = Array.Empty<byte>();
        if (string.IsNullOrEmpty(input))
        {
            return false;
        }

        // Convert URL-safe alphabet back to standard base64 + pad.
        var s = input.Replace('-', '+').Replace('_', '/');
        var pad = s.Length % 4;
        if (pad == 2)
        {
            s += "==";
        }
        else if (pad == 3)
        {
            s += "=";
        }
        else if (pad != 0)
        {
            return false;
        }

        try
        {
            decoded = Convert.FromBase64String(s);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
