// SlothBox.Receipt — strongly-typed configuration bound from environment variables.
//
// Why a dedicated options class instead of pulling from IConfiguration ad-hoc:
//   * Validation runs ONCE at startup (ValidateOnStart). A bad env var fails
//     fast with a clear message instead of NREing at first request.
//   * Every consumer asks for IOptions<ReceiptOptions> — no string-keyed
//     IConfiguration["RECEIPT_PORT"] sprinkled across the codebase.
//   * v0.5's TSA client and database path will pull from the same instance,
//     so we lock the shape now.
//
// All settings are populated from ENV (UPPER_SNAKE_CASE) per the project's
// .env.example contract. The DotNet config provider's "double underscore"
// nesting convention is irrelevant here — these are flat env vars.

using System.ComponentModel.DataAnnotations;

namespace SlothBox.Receipt.Configuration;

/// <summary>
/// Service-wide configuration. Bound from environment variables at startup
/// and validated via <see cref="ValidationAttribute"/> annotations.
/// </summary>
public sealed class ReceiptOptions
{
    /// <summary>
    /// Configuration section name. The host binds the entire env-var space
    /// (no prefix) directly to this options class via custom mapping in
    /// <c>Program.cs</c>, so this is mostly for tests / IOptionsSnapshot.
    /// </summary>
    public const string SectionName = "Receipt";

    /// <summary>
    /// Port the Kestrel listener binds on (0.0.0.0:PORT). Default 3024 — the
    /// reserved port in the SlothBox compose file. Must match the
    /// docker-compose <c>ASPNETCORE_URLS</c> setting.
    /// </summary>
    [Range(1, 65535, ErrorMessage = "RECEIPT_PORT must be a valid TCP port.")]
    public int Port { get; init; } = 3024;

    /// <summary>
    /// RFC 3161 Timestamp Authority endpoint. v0.1 does NOT contact this —
    /// the value is recorded so the option binding contract is fixed. v0.5
    /// will issue HTTP POSTs of <c>application/timestamp-query</c> to this
    /// URL via <see cref="System.Net.Http.HttpClient"/>.
    /// </summary>
    /// <remarks>
    /// Default is freetsa.org per docs/RECEIPTS.md — fine for development
    /// and v0.5 launch, but production-grade SLA needs a paid TSA
    /// (DigiCert, Sectigo) before v1.0.
    /// </remarks>
    [Required(AllowEmptyStrings = false, ErrorMessage = "RECEIPT_TSA_URL is required.")]
    [Url(ErrorMessage = "RECEIPT_TSA_URL must be a valid absolute URL.")]
    public string TsaUrl { get; init; } = "https://freetsa.org/tsr";

    /// <summary>
    /// Postgres connection string in <c>libpq</c> URI form
    /// (<c>postgresql://user:pass@host:port/db</c>). v0.1 only uses this
    /// for the /healthz database probe; v0.5 persists Merkle leaves here.
    /// </summary>
    [Required(AllowEmptyStrings = false, ErrorMessage = "DATABASE_URL is required.")]
    public string DatabaseUrl { get; init; } = string.Empty;

    /// <summary>
    /// Serilog minimum level. Accepted values: Verbose, Debug, Information,
    /// Warning, Error, Fatal. Lowercase "info" / "warn" tolerated (mapped
    /// during binding). Default Information.
    /// </summary>
    [Required(AllowEmptyStrings = false)]
    public string LogLevel { get; init; } = "Information";

    /// <summary>
    /// TSA HTTP timeout in seconds. v0.1 unused; v0.5 wires this into the
    /// HttpClient that POSTs the timestamp request.
    /// </summary>
    [Range(1, 300, ErrorMessage = "RECEIPT_TSA_TIMEOUT_SECONDS must be 1..300.")]
    public int TsaTimeoutSeconds { get; init; } = 30;
}
