// SlothBox.Ingest — Valkey/Redis-backed sliding-window rate limiter.
//
// Algorithm: a sorted set per bucket where members are unique request IDs and
// scores are unix-ms timestamps. On each call we
//   1. ZREMRANGEBYSCORE to evict expired entries,
//   2. ZCARD to count what's left,
//   3. ZADD ourselves only if still under the limit,
//   4. PEXPIRE so empty buckets don't pile up.
//
// Steps 1-4 run as a single Lua script (EVAL) so the evict->count->add
// sequence executes atomically on the server — concurrent callers cannot slip
// through a check-then-act window race (an earlier version awaited the four
// commands separately, which let N callers all read count < limit between ZCARD
// and ZADD and collectively exceed the limit). StackExchange.Redis caches the
// script by SHA after the first call, so steady-state cost is one EVALSHA
// round-trip.

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
    // Atomic sliding-window acquire. KEYS[1] = bucket key; ARGV = now(ms),
    // cutoff(ms), limit, ttl(ms), member. Returns 1 if the caller is admitted,
    // 0 if the window is full. The whole evict->count->conditional-add runs in
    // one server-side step, so there is no window between the count and the add
    // for a concurrent caller to exploit.
    private const string AcquireScript = @"
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])
local member = ARGV[5]
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttl_ms)
return 1";

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
            var ttlMs = ((long)windowSeconds + 5) * 1000;
            var memberId = $"{nowMs}:{Guid.NewGuid():N}";

            // One atomic EVAL: evict expired -> count -> add-if-under-limit ->
            // refresh TTL. Returns 1 (admitted) or 0 (limited).
            var result = await db.ScriptEvaluateAsync(
                AcquireScript,
                new RedisKey[] { key },
                new RedisValue[] { nowMs, cutoff, limit, ttlMs, memberId })
                .ConfigureAwait(false);

            return (long)result == 1;
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
