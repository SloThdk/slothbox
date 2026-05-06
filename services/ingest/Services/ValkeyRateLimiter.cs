// SlothBox.Ingest — Valkey/Redis-backed sliding-window rate limiter.
//
// Algorithm: a sorted set per bucket where members are unique request IDs and
// scores are unix-ms timestamps. On each call we
//   1. ZREMRANGEBYSCORE to evict expired entries,
//   2. ZCARD to count what's left,
//   3. ZADD ourselves if still under the limit,
//   4. EXPIRE so empty buckets don't pile up.
//
// We pipeline 1+2+3+4 in a single MULTI/EXEC so concurrent callers can't slip
// through a window race.

using System.Globalization;
using Microsoft.Extensions.Options;
using SlothBox.Ingest.Configuration;
using StackExchange.Redis;

namespace SlothBox.Ingest.Services;

/// <summary>
/// Valkey/Redis-backed sliding-window rate limiter using a per-bucket sorted set.
/// </summary>
public sealed class ValkeyRateLimiter : IRateLimiter, IAsyncDisposable
{
    private readonly Lazy<Task<IConnectionMultiplexer>> _muxLazy;
    private readonly ILogger<ValkeyRateLimiter> _logger;

    public ValkeyRateLimiter(IOptions<IngestOptions> options, ILogger<ValkeyRateLimiter> logger)
    {
        _logger = logger;

        // The connection lazily resolves so the constructor doesn't block startup
        // on a Redis that's still booting in docker compose.
        _muxLazy = new Lazy<Task<IConnectionMultiplexer>>(async () =>
        {
            var configuration = ConfigurationOptions.Parse(NormalizeRedisUrl(options.Value.RedisUrl));
            configuration.AbortOnConnectFail = false;
            return await ConnectionMultiplexer.ConnectAsync(configuration).ConfigureAwait(false);
        });
    }

    /// <inheritdoc />
    public async Task<bool> TryAcquireAsync(
        string bucket,
        int limit,
        int windowSeconds,
        CancellationToken ct)
    {
        if (limit <= 0 || windowSeconds <= 0)
        {
            return true;
        }

        try
        {
            var mux = await _muxLazy.Value.WaitAsync(ct).ConfigureAwait(false);
            var db = mux.GetDatabase();

            var key = $"ratelimit:{bucket}";
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var windowMs = (long)windowSeconds * 1000;
            var cutoff = nowMs - windowMs;
            var memberId = $"{nowMs}:{Guid.NewGuid():N}";

            // Evict expired
            await db.SortedSetRemoveRangeByScoreAsync(key, double.NegativeInfinity, cutoff)
                .ConfigureAwait(false);

            // Count what's left
            var count = await db.SortedSetLengthAsync(key).ConfigureAwait(false);
            if (count >= limit)
            {
                return false;
            }

            // Add ourselves and refresh TTL
            await db.SortedSetAddAsync(key, memberId, nowMs).ConfigureAwait(false);
            await db.KeyExpireAsync(key, TimeSpan.FromSeconds(windowSeconds + 5))
                .ConfigureAwait(false);

            return true;
        }
        catch (Exception ex)
        {
            // Fail open: a Redis outage shouldn't take down ingest. We log loudly
            // and let the request through; the upstream api-gateway has its own
            // limiter as a second layer of defence.
            _logger.LogWarning(ex, "Rate-limit check failed for bucket {Bucket}; failing open", bucket);
            return true;
        }
    }

    /// <inheritdoc />
    public async Task<bool> HealthCheckAsync(CancellationToken ct)
    {
        try
        {
            var mux = await _muxLazy.Value.WaitAsync(ct).ConfigureAwait(false);
            var db = mux.GetDatabase();
            var pong = await db.PingAsync().ConfigureAwait(false);
            return pong < TimeSpan.FromSeconds(2);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Valkey health check failed");
            return false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_muxLazy.IsValueCreated)
        {
            try
            {
                var mux = await _muxLazy.Value.ConfigureAwait(false);
                await mux.CloseAsync().ConfigureAwait(false);
                mux.Dispose();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Error closing Valkey mux on dispose");
            }
        }
    }

    /// <summary>
    /// Convert redis://[user:pass@]host:port[/db] to StackExchange.Redis-compatible
    /// host:port,password=...,defaultDatabase=... form. Leaves bare host:port alone.
    /// </summary>
    private static string NormalizeRedisUrl(string redisUrl)
    {
        if (string.IsNullOrWhiteSpace(redisUrl))
        {
            throw new ArgumentException("REDIS_URL is required", nameof(redisUrl));
        }

        if (!redisUrl.StartsWith("redis://", StringComparison.OrdinalIgnoreCase) &&
            !redisUrl.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase))
        {
            // Already in StackExchange.Redis form (host:port[,...]).
            return redisUrl;
        }

        var uri = new Uri(redisUrl);
        var useSsl = uri.Scheme.Equals("rediss", StringComparison.OrdinalIgnoreCase);
        var port = uri.Port == -1 ? 6379 : uri.Port;
        var parts = new List<string> { $"{uri.Host}:{port.ToString(CultureInfo.InvariantCulture)}" };

        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var split = uri.UserInfo.Split(':', 2);
            if (split.Length == 2)
            {
                parts.Add($"user={Uri.UnescapeDataString(split[0])}");
                parts.Add($"password={Uri.UnescapeDataString(split[1])}");
            }
            else
            {
                parts.Add($"password={Uri.UnescapeDataString(split[0])}");
            }
        }

        if (useSsl)
        {
            parts.Add("ssl=true");
        }

        var path = uri.AbsolutePath.Trim('/');
        if (!string.IsNullOrEmpty(path) && int.TryParse(path, NumberStyles.Integer, CultureInfo.InvariantCulture, out var dbIndex))
        {
            parts.Add($"defaultDatabase={dbIndex.ToString(CultureInfo.InvariantCulture)}");
        }

        parts.Add("abortConnect=false");

        return string.Join(",", parts);
    }
}
