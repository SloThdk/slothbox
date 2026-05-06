// SlothBox.Ingest — abstraction over the blob backend (MinIO / S3-compatible).
//
// We hide the SDK behind an interface so tests can swap in a fake and so
// switching to native AWS S3 / Cloudflare R2 in v0.5 is a single-file change.

namespace SlothBox.Ingest.Services;

/// <summary>
/// Bucket-level operations the ingest service needs. All methods are async and
/// must be cancellation-aware — the caller passes the request's CancellationToken
/// so a disconnected client immediately frees resources.
/// </summary>
public interface IBlobStorage
{
    /// <summary>
    /// Upload <paramref name="content"/> to <paramref name="objectKey"/>. Streams
    /// the source — never buffers the whole body. <paramref name="contentLength"/>
    /// must be the EXACT byte count of the stream; MinIO requires it for non-multipart PUTs.
    /// </summary>
    Task PutAsync(
        string objectKey,
        Stream content,
        long contentLength,
        string contentType,
        CancellationToken ct);

    /// <summary>
    /// Stream the named object back via <paramref name="writer"/>, called once
    /// per object with a readable stream. Caller is expected to copy and dispose.
    /// </summary>
    Task GetAsync(
        string objectKey,
        Func<Stream, CancellationToken, Task> writer,
        CancellationToken ct);

    /// <summary>
    /// Delete an object. Idempotent: missing object is not an error.
    /// </summary>
    Task DeleteAsync(string objectKey, CancellationToken ct);

    /// <summary>
    /// Cheap existence check. Used by health endpoint and by the upload path
    /// to short-circuit re-uploads of identical chunks.
    /// </summary>
    Task<bool> ExistsAsync(string objectKey, CancellationToken ct);

    /// <summary>
    /// Verify the bucket is reachable. Used by /healthz. Should NOT raise on
    /// network issues — return false instead, so health-check classification stays
    /// in the caller's hands.
    /// </summary>
    Task<bool> HealthCheckAsync(CancellationToken ct);
}
