// SlothBox.Ingest — DTOs for chunk metadata.
//
// share_chunks rows track WHERE the ciphertext lives in MinIO and WHAT nonce
// it was encrypted with. The ciphertext itself never touches Postgres.

namespace SlothBox.Ingest.Models;

/// <summary>
/// Metadata projection of a `share_chunks` row.
/// </summary>
public sealed record Chunk
{
    public required Guid ShareId { get; init; }
    public required int ChunkIndex { get; init; }

    /// <summary>24-byte XChaCha20-Poly1305 nonce.</summary>
    public required byte[] Nonce { get; init; }

    /// <summary>MinIO object key, in the form "shortId/chunkIndex".</summary>
    public required string BlobKey { get; init; }

    public required int CiphertextSize { get; init; }

    public DateTimeOffset? UploadedAt { get; init; }

    /// <summary>
    /// First time this chunk's ciphertext was fully streamed back to a
    /// downloader, or null if never served. Migration 0004 introduced
    /// the column; the v0.7 ingest endpoint uses it to refuse a second
    /// serve under the single-use chunk-token regime (migration 0007).
    /// </summary>
    public DateTimeOffset? ServedAt { get; init; }

    /// <summary>
    /// 32-byte SHA-256 commitment of the client-derived single-use
    /// download token. Set at upload time via the
    /// `X-Slothbox-Chunk-Token-Hash` header; the download endpoint
    /// hashes the incoming bearer token and constant-time compares
    /// against this value.
    ///
    /// NULL on chunks uploaded before migration 0007 — those bypass
    /// the token check and serve as in v0.1 (backward compatibility
    /// covering the in-flight window after the migration runs but
    /// before legacy chunks have expired).
    /// </summary>
    public byte[]? DownloadTokenHash { get; init; }
}

/// <summary>
/// JSON response shape for PUT /chunk/{shortId}/{chunkIndex}.
/// </summary>
public sealed record ChunkUploadResponse(
    int ChunkIndex,
    string BlobKey,
    DateTimeOffset UploadedAt
);
