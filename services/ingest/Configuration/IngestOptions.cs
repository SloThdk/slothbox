// SlothBox.Ingest — runtime configuration bound from environment variables.
//
// All required values must be present at startup; Program.cs calls Validate() and
// hard-fails the process if anything is missing. We never want to discover a
// missing MINIO_SECRET_KEY at the moment the first chunk is uploaded.

using System.ComponentModel.DataAnnotations;

namespace SlothBox.Ingest.Configuration;

/// <summary>
/// Bound from the process environment. Single source of truth for ingest service
/// configuration. Hard-fails startup if any required field is empty/null.
/// </summary>
public sealed class IngestOptions
{
    public const string SectionName = "Ingest";

    /// <summary>Listening port for Kestrel (also reflected in ASPNETCORE_URLS).</summary>
    public int Port { get; set; } = 3023;

    /// <summary>Postgres connection string. Accepts libpq (postgresql://...) format
    /// and gets converted to Npgsql key/value form by <see cref="GetNpgsqlConnectionString"/>.</summary>
    [Required(AllowEmptyStrings = false)]
    public string DatabaseUrl { get; set; } = "";

    // ─── MinIO ──────────────────────────────────────────────────
    /// <summary>MinIO endpoint, host:port form (no scheme). e.g. "minio:9000".</summary>
    [Required(AllowEmptyStrings = false)]
    public string MinioEndpoint { get; set; } = "";

    [Required(AllowEmptyStrings = false)]
    public string MinioAccessKey { get; set; } = "";

    [Required(AllowEmptyStrings = false)]
    public string MinioSecretKey { get; set; } = "";

    [Required(AllowEmptyStrings = false)]
    public string MinioBucket { get; set; } = "slothbox-blobs";

    public string MinioRegion { get; set; } = "eu-central-1";

    public bool MinioUseSsl { get; set; } = false;

    // ─── Valkey / Redis ─────────────────────────────────────────
    /// <summary>Valkey/Redis URL (redis://host:port[/db]).</summary>
    [Required(AllowEmptyStrings = false)]
    public string RedisUrl { get; set; } = "";

    // ─── Service-to-service auth ────────────────────────────────
    /// <summary>Shared secret required on DELETE /chunk/* via the X-Internal-Token
    /// header. Compared with constant-time equality.</summary>
    [Required(AllowEmptyStrings = false)]
    [MinLength(32, ErrorMessage = "INTERNAL_TOKEN must be at least 32 characters")]
    public string InternalToken { get; set; } = "";

    // ─── Chunk-size guards ──────────────────────────────────────
    /// <summary>Hard cap for any single PUT body. Defends against zip-bomb-style
    /// abuse where a client claims a small chunkSize but uploads gigabytes per chunk.</summary>
    public int MaxChunkBytes { get; set; } = 10 * 1024 * 1024; // 10 MB

    /// <summary>Required nonce length after base64url decode. XChaCha20-Poly1305.</summary>
    public int NonceBytes { get; set; } = 24;

    // ─── Validation ─────────────────────────────────────────────
    /// <summary>
    /// Run DataAnnotations validation. Returns a non-empty string of error messages
    /// when invalid, or null when valid. Caller should hard-fail on non-null.
    /// </summary>
    public string? Validate()
    {
        var ctx = new ValidationContext(this);
        var results = new List<ValidationResult>();
        if (Validator.TryValidateObject(this, ctx, results, validateAllProperties: true))
        {
            return null;
        }
        return string.Join("; ", results.Select(r => r.ErrorMessage));
    }

    /// <summary>
    /// Convert a libpq URL (postgresql://user:pass@host:port/db) to an Npgsql
    /// keyword=value connection string. Despite occasional claims to the
    /// contrary, Npgsql 8's NpgsqlConnectionStringBuilder routes through
    /// DbConnectionStringBuilder.set_ConnectionString which throws
    /// "Format of the initialization string does not conform to specification"
    /// on any URI-form input. So we explicitly normalise here. Same logic
    /// lives in services/receipt/Program.cs (ConvertToNpgsqlConnectionString)
    /// — keep them in sync if either changes.
    /// </summary>
    public string GetNpgsqlConnectionString()
    {
        if (string.IsNullOrWhiteSpace(DatabaseUrl))
        {
            return string.Empty;
        }

        // Already a keyword=value;... string — pass through.
        if (
            !DatabaseUrl.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)
            && !DatabaseUrl.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
        )
        {
            return DatabaseUrl;
        }

        var uri = new Uri(DatabaseUrl);
        var userInfo = uri.UserInfo;
        var user = Uri.UnescapeDataString(userInfo.Split(':')[0]);
        var password = userInfo.Contains(':', StringComparison.Ordinal)
            ? Uri.UnescapeDataString(
                userInfo[(userInfo.IndexOf(':', StringComparison.Ordinal) + 1)..]
            )
            : string.Empty;
        var database = uri.AbsolutePath.TrimStart('/');
        var port = uri.Port > 0 ? uri.Port : 5432;

        // Pooling=true is the Npgsql default but stating it explicitly makes
        // the runtime intent obvious to anyone reading logs / connection
        // strings. Application Name surfaces in pg_stat_activity which makes
        // troubleshooting noisy-tenant scenarios easier later.
        return $"Host={uri.Host};Port={port};Username={user};Password={password};"
            + $"Database={database};Pooling=true;Application Name=slothbox-ingest";
    }
}
