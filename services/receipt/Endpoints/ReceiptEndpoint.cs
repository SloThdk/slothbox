// SlothBox.Receipt — receipt endpoints (v0.1 STUBS).
//
// Both endpoints return 501 Not Implemented with a JSON envelope pointing to
// MILESTONES.md. The body shape is the same on both routes so consumers can
// branch on `error == "not_implemented"` without parsing different schemas.
//
// v0.5 will replace the body of these handlers with calls to IReceiptIssuer.

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace SlothBox.Receipt.Endpoints;

/// <summary>
/// /receipt/* route mapping. v0.1 ships stubs; v0.5 swaps them for live
/// RFC 3161 issuance / lookup.
/// </summary>
public static class ReceiptEndpoint
{
    /// <summary>
    /// The unified 501 response body. Constant so v0.5's flip-day diff is
    /// purely structural — only the call into <see cref="Services.IReceiptIssuer"/>
    /// changes, the error envelope contract stays identical for clients.
    /// </summary>
    private static readonly object NotImplementedBody = new
    {
        error = "not_implemented",
        message = "RFC 3161 receipts land in v0.5. " +
                  "See https://github.com/SloThdk/slothbox/blob/master/MILESTONES.md",
        milestone = "v0.5.0",
    };

    /// <summary>
    /// Maps <c>GET /receipt/{shortId}</c> and <c>POST /receipt/issue</c>.
    /// Both routes return <c>501 Not Implemented</c> in v0.1.
    /// </summary>
    public static IEndpointRouteBuilder MapReceiptEndpoints(this IEndpointRouteBuilder routes)
    {
        // GET /receipt/{shortId}
        // Public lookup: the recipient (or anyone with the receipt URL) fetches
        // the receipt envelope to verify offline. Will be cache-friendly in v0.5
        // (immutable once issued).
        // TODO(v0.5): replace stub with `IReceiptIssuer.GetByShortIdAsync` —
        //             return 404 if null, 200 with the envelope otherwise.
        //             See MILESTONES.md → v0.5.0 "Accounts and Receipts".
        routes.MapGet("/receipt/{shortId}", (string shortId) =>
                Results.Json(NotImplementedBody, statusCode: StatusCodes.Status501NotImplemented))
            .WithName("GetReceipt")
            .WithDescription("Lookup a receipt by short id. STUB — implementation lands in v0.5.0.");

        // POST /receipt/issue
        // Internal: the api-gateway calls this when a download completes. Body
        // shape will be `IssueReceiptRequest` (shareId, fileHash, fileSize,
        // ipRegion). Returns the assembled `ReceiptEnvelope`.
        // TODO(v0.5): replace stub with `IReceiptIssuer.IssueAsync`. Auth via
        //             internal-network shared secret + mTLS once Caddy is
        //             configured for it.
        //             See MILESTONES.md → v0.5.0 "Accounts and Receipts".
        routes.MapPost("/receipt/issue", () =>
                Results.Json(NotImplementedBody, statusCode: StatusCodes.Status501NotImplemented))
            .WithName("IssueReceipt")
            .WithDescription("Issue a new receipt for a completed download. STUB — implementation lands in v0.5.0.");

        return routes;
    }
}
