// SlothBox.Ingest — share + chunk persistence layer.
//
// All Postgres access goes through this interface. Concrete implementation in
// PostgresShareRepository.cs uses Npgsql directly (no EF Core — overhead not
// justified for ~6 query shapes).

using SlothBox.Ingest.Models;

namespace SlothBox.Ingest.Services;

/// <summary>
/// Read/write operations against the `shares` and `share_chunks` tables.
/// All methods are cancellation-aware; the caller passes the request CT.
/// </summary>
public interface IShareRepository
{
    /// <summary>
    /// Look up a share by its public short identifier. Returns null when missing.
    /// </summary>
    Task<Share?> GetShareByShortIdAsync(string shortId, CancellationToken ct);

    /// <summary>
    /// Insert a chunk row idempotently. If a row with (share_id, chunk_index) already
    /// exists, update it in place (the client may legitimately retry an upload — for
    /// example after a TCP reset — and we want the latest blob_key/nonce/size to win).
    /// </summary>
    /// <param name="downloadTokenHash">
    /// 32-byte SHA-256 commitment of the client-derived single-use
    /// download token (migration 0007), or null for v0.1-style uploads
    /// that don't carry the `X-Slothbox-Chunk-Token-Hash` header.
    /// </param>
    Task UpsertChunkAsync(
        Guid shareId,
        int chunkIndex,
        byte[] nonce,
        string blobKey,
        int ciphertextSize,
        DateTimeOffset uploadedAt,
        byte[]? downloadTokenHash,
        CancellationToken ct);

    /// <summary>
    /// Count of chunk rows for a share with non-null uploaded_at. Used to detect
    /// when all chunks have arrived so we can promote state pending|uploading -> ready.
    /// </summary>
    Task<int> CountUploadedChunksAsync(Guid shareId, CancellationToken ct);

    /// <summary>
    /// Set the share state. Returns true on a state change, false when no row matched.
    /// </summary>
    Task<bool> UpdateShareStateAsync(Guid shareId, ShareState newState, CancellationToken ct);

    /// <summary>
    /// Look up a single chunk's metadata for the GET path.
    /// </summary>
    Task<Chunk?> GetChunkAsync(Guid shareId, int chunkIndex, CancellationToken ct);

    /// <summary>
    /// Mark a chunk as fully served back to a downloader. Called by
    /// DownloadEndpoint AFTER stream.CopyToAsync returns successfully —
    /// i.e. once the ciphertext has physically left the server.
    ///
    /// Inside the underlying SQL function (migration 0004), the call:
    ///   1. Acquires a FOR UPDATE row lock on the parent shares row, which
    ///      serialises against parallel chunk completions and against the
    ///      gateway's `increment_download` path.
    ///   2. Updates this chunk's served_at (preserved on retry) and
    ///      served_count (always incremented).
    ///   3. If the share is burn_after_read AND state='ready' AND every
    ///      chunk now has served_at set, atomically flips state →
    ///      'destroyed', sets destroyed_reason='burn', and appends a
    ///      share_destroyed entry to the audit chain inside the SAME txn.
    ///
    /// The returned <see cref="ChunkServedResult.BurnFired"/> tells the
    /// caller whether this delivery was the one that triggered the burn —
    /// the ingest endpoint uses it to publish a NATS notification so the
    /// reaper runs an immediate sweep instead of waiting for its 60 s
    /// tick.
    /// </summary>
    Task<ChunkServedResult> MarkChunkServedAsync(
        Guid shareId,
        int chunkIndex,
        CancellationToken ct);

    /// <summary>
    /// Verify Postgres is reachable. Returns false on any failure so the
    /// /healthz handler can return 503 cleanly.
    /// </summary>
    Task<bool> HealthCheckAsync(CancellationToken ct);
}

/// <summary>
/// Result of a <see cref="IShareRepository.MarkChunkServedAsync"/> call.
/// Mirrors the three-column return shape of the SQL function.
/// </summary>
/// <param name="BurnFired">
/// True iff this call atomically flipped the parent share to
/// state='destroyed'. False both when the share was not burn-after-read
/// AND when an earlier call (gateway or parallel chunk) already fired the
/// burn — both branches are normal, not error states.
/// </param>
/// <param name="ShareState">
/// The share's state after the function commits. Used by the caller for
/// logging and for the optional NATS notification.
/// </param>
/// <param name="AuditId">
/// The audit_chain.seq of the new share_destroyed entry, or null when
/// BurnFired = false. Useful for end-to-end correlation in logs.
/// </param>
public sealed record ChunkServedResult(
    bool BurnFired,
    ShareState ShareState,
    long? AuditId);
