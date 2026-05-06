// SlothBox.Ingest — sliding-window rate limiter abstraction (Valkey-backed).
//
// Used to throttle the public PUT/GET endpoints by short_id so a single share
// can't be hammered by a runaway client. NOT a replacement for the per-IP/global
// limiter the api-gateway runs upstream — this is a chunk-level safety net that
// also catches mis-coded clients.

namespace SlothBox.Ingest.Services;

/// <summary>
/// Sliding-window counter, keyed by an arbitrary bucket string.
/// </summary>
public interface IRateLimiter
{
    /// <summary>
    /// Try to consume one token from <paramref name="bucket"/>. Returns true when
    /// the request is within the allowed limit, false when it should be 429'd.
    /// </summary>
    /// <param name="bucket">Stable identifier — typically "ingest:put:{shortId}".</param>
    /// <param name="limit">Max requests within the window.</param>
    /// <param name="windowSeconds">Window length.</param>
    /// <param name="ct">Cancellation token.</param>
    Task<bool> TryAcquireAsync(
        string bucket,
        int limit,
        int windowSeconds,
        CancellationToken ct);

    /// <summary>
    /// Verify Valkey is reachable. Returns false on any failure.
    /// </summary>
    Task<bool> HealthCheckAsync(CancellationToken ct);
}
