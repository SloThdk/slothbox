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
    Task UpsertChunkAsync(
        Guid shareId,
        int chunkIndex,
        byte[] nonce,
        string blobKey,
        int ciphertextSize,
        DateTimeOffset uploadedAt,
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
    /// Verify Postgres is reachable. Returns false on any failure so the
    /// /healthz handler can return 503 cleanly.
    /// </summary>
    Task<bool> HealthCheckAsync(CancellationToken ct);
}
