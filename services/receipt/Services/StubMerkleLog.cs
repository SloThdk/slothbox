// SlothBox.Receipt — v0.1 stub.
//
// Wired into DI so the service compiles and the dependency graph mirrors
// v0.5. Every method throws NotImplementedException — the HTTP layer
// short-circuits to 501 before any of these are reached.

namespace SlothBox.Receipt.Services;

/// <summary>
/// v0.1 stub of <see cref="IMerkleLog"/>. Throws
/// <see cref="NotImplementedException"/> on every call.
///
/// <para>
/// v0.5 will replace this with <c>PostgresMerkleLog</c> backed by a
/// <c>merkle_leaves</c> + <c>merkle_anchors</c> pair of tables and BLAKE2b
/// over the leaf hashes.
/// </para>
/// </summary>
public sealed class StubMerkleLog : IMerkleLog
{
    private const string MilestoneMessage =
        "Merkle audit chain lands in v0.5.0. " +
        "See https://github.com/SloThdk/slothbox/blob/master/MILESTONES.md";

    /// <inheritdoc />
    public Task<long> AppendAsync(string leafHash, CancellationToken cancellationToken)
        => throw new NotImplementedException(MilestoneMessage);

    /// <inheritdoc />
    public Task<MerkleProof?> GetProofAsync(long leafIndex, CancellationToken cancellationToken)
        => throw new NotImplementedException(MilestoneMessage);

    /// <inheritdoc />
    public Task<RootAnchor?> GetAnchorAsync(DateOnly utcDate, CancellationToken cancellationToken)
        => throw new NotImplementedException(MilestoneMessage);
}
