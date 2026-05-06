// SlothBox.Ingest — DTO for the `shares` row read by the ingest service.
//
// We only project the columns ingest cares about. The full row has more
// fields (file_hash, encrypted_meta, owner_id, etc.) but those are read by
// other services (api-gateway for the receiver UI, receipt for audit).

namespace SlothBox.Ingest.Models;

/// <summary>
/// State of a share, mirroring the CHECK constraint in the schema.
/// </summary>
public enum ShareState
{
    Pending,
    Uploading,
    Ready,
    Downloaded,
    Expired,
    Destroyed,
}

/// <summary>
/// Read-only snapshot of a share's metadata as ingest sees it.
/// Always loaded by short_id; the internal Guid id is what gets stored on chunk rows.
/// </summary>
public sealed record Share
{
    public required Guid Id { get; init; }
    public required string ShortId { get; init; }
    public required ShareState State { get; init; }
    public required int ChunkCount { get; init; }
    public required int ChunkSize { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }

    /// <summary>True iff the share is in a state that accepts new chunk uploads.</summary>
    public bool CanAcceptUploads => State == ShareState.Pending || State == ShareState.Uploading;

    /// <summary>True iff the share is in a state that allows chunk downloads.</summary>
    public bool CanServeDownloads => State == ShareState.Ready || State == ShareState.Downloaded;

    /// <summary>True iff the share has expired, regardless of recorded state.</summary>
    public bool IsExpired => DateTimeOffset.UtcNow >= ExpiresAt;

    /// <summary>
    /// Parse the schema-level state TEXT into the strongly typed enum. Throws
    /// for unknown values rather than silently mapping to a default — an unexpected
    /// state value indicates a schema/code drift we want to fail loudly.
    /// </summary>
    public static ShareState ParseState(string raw) => raw switch
    {
        "pending" => ShareState.Pending,
        "uploading" => ShareState.Uploading,
        "ready" => ShareState.Ready,
        "downloaded" => ShareState.Downloaded,
        "expired" => ShareState.Expired,
        "destroyed" => ShareState.Destroyed,
        _ => throw new InvalidOperationException($"Unknown share state: {raw}"),
    };
}
