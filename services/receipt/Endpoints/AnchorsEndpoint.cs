// SlothBox.Receipt — public Merkle anchor endpoint (v0.1 STUB).
//
// The endpoint a verifier CLI hits to fetch the published Merkle root for a
// given UTC date, completing the docs/RECEIPTS.md verification flow:
//
//   3. published = fetch(receipt.merkleProof.rootAnchorUrl)
//      if published != receipt.merkleProof.rootHash: INVALID
//
// This route is public-cacheable — anchors are immutable once published —
// so v0.5 will set Cache-Control: public, max-age=31536000, immutable.

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace SlothBox.Receipt.Endpoints;

/// <summary>
/// /audit/anchors/* route mapping. v0.1 ships a 501 stub.
/// </summary>
public static class AnchorsEndpoint
{
    /// <summary>
    /// Unified 501 body — identical envelope to <see cref="ReceiptEndpoint"/>
    /// so error-handling in clients can be one code path.
    /// </summary>
    private static readonly object NotImplementedBody = new
    {
        error = "not_implemented",
        message = "RFC 3161 receipts land in v0.5. " +
                  "See https://github.com/SloThdk/slothbox/blob/master/MILESTONES.md",
        milestone = "v0.5.0",
    };

    /// <summary>
    /// Maps <c>GET /audit/anchors/{date}</c>.
    /// </summary>
    public static IEndpointRouteBuilder MapAnchorsEndpoints(this IEndpointRouteBuilder routes)
    {
        // GET /audit/anchors/{date}
        // Public: returns the most recent Merkle root anchor on or before the
        // given UTC date (`YYYY-MM-DD`). Used by the verifier CLI in step 3 of
        // the offline verification flow (see docs/RECEIPTS.md).
        // TODO(v0.5): replace stub with `IMerkleLog.GetAnchorAsync`. Add
        //             Cache-Control: immutable since published anchors never
        //             change. Return 404 if `date` is in the future or
        //             pre-launch (no anchor yet).
        //             See MILESTONES.md → v0.5.0 "Accounts and Receipts".
        routes.MapGet("/audit/anchors/{date}", (string date) =>
                Results.Json(NotImplementedBody, statusCode: StatusCodes.Status501NotImplemented))
            .WithName("GetAnchor")
            .WithDescription("Lookup the published Merkle root for a UTC date. STUB — implementation lands in v0.5.0.");

        return routes;
    }
}
