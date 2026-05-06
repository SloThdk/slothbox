// SlothBox.Receipt — v0.1 stub.
//
// This implementation is wired into DI so the service compiles and the
// dependency graph is identical to v0.5. Every method throws
// NotImplementedException with a milestone reference so any code that
// accidentally calls past the 501 short-circuit fails loud, not silent.

namespace SlothBox.Receipt.Services;

/// <summary>
/// v0.1 stub of <see cref="IReceiptIssuer"/>. Throws
/// <see cref="NotImplementedException"/> on every call.
///
/// <para>
/// The HTTP endpoints layer (<c>Endpoints/ReceiptEndpoint.cs</c>)
/// short-circuits to <c>501 Not Implemented</c> before reaching this class
/// — the stub is here to lock the DI registration in v0.1 so v0.5 only
/// has to swap the registered implementation, not change the wire-up.
/// </para>
///
/// <para>
/// v0.5 will replace this with <c>BouncyCastleReceiptIssuer</c> which uses
/// <c>BouncyCastle.Tsp</c> for the TSA round-trip and <c>Npgsql</c> for
/// Merkle-leaf persistence.
/// </para>
/// </summary>
public sealed class StubReceiptIssuer : IReceiptIssuer
{
    private const string MilestoneMessage =
        "RFC 3161 receipt issuance lands in v0.5.0. " +
        "See https://github.com/SloThdk/slothbox/blob/master/MILESTONES.md";

    /// <inheritdoc />
    public Task<ReceiptEnvelope> IssueAsync(IssueReceiptRequest request, CancellationToken cancellationToken)
        => throw new NotImplementedException(MilestoneMessage);

    /// <inheritdoc />
    public Task<ReceiptEnvelope?> GetByShortIdAsync(string shortId, CancellationToken cancellationToken)
        => throw new NotImplementedException(MilestoneMessage);
}
