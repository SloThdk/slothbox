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
}

/// <summary>
/// JSON response shape for PUT /chunk/{shortId}/{chunkIndex}.
/// </summary>
public sealed record ChunkUploadResponse(
    int ChunkIndex,
    string BlobKey,
    DateTimeOffset UploadedAt
);
