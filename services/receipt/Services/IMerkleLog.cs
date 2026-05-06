// SlothBox.Receipt — Merkle audit chain abstraction.
//
// Append-only log of receipt hashes. Roots are published every N leaves or
// every M minutes (whichever first) to a public read-only endpoint. The
// publication is what makes receipts tamper-evident — once a root is
// publicly anchored, any change to a covered leaf would re-derive a
// different root, and the public anchor would no longer match.

namespace SlothBox.Receipt.Services;

/// <summary>
/// Append-only Merkle audit log of issued receipts.
///
/// <para>
/// Implementations MUST guarantee:
/// </para>
/// <list type="bullet">
///   <item>Append-only ordering (no leaf insertion, no leaf removal).</item>
///   <item>Stable leaf indices once assigned.</item>
///   <item>Deterministic root hashing for any subset prefix.</item>
/// </list>
///
/// <para>
/// v0.1 implementation is <see cref="StubMerkleLog"/> which throws
/// <see cref="NotImplementedException"/>. Real implementation in v0.5
/// uses BLAKE2b-256 over leaf hashes, persisted in Postgres with a
/// <c>merkle_leaves</c> table indexed by <c>(leaf_index)</c>.
/// </para>
/// </summary>
public interface IMerkleLog
{
    /// <summary>
    /// Append a leaf to the audit chain. Returns the leaf index assigned.
    /// Idempotent on the leaf hash — appending the same hash twice returns
    /// the original index (v0.5 enforces via UNIQUE constraint).
    /// </summary>
    /// <param name="leafHash">BLAKE2b-256 of the receipt body, hex-encoded.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The 0-based leaf index assigned to this entry.</returns>
    /// <exception cref="NotImplementedException">
    /// Thrown in v0.1. Lands in v0.5 — see MILESTONES.md.
    /// </exception>
    Task<long> AppendAsync(string leafHash, CancellationToken cancellationToken);

    /// <summary>
    /// Compute the inclusion proof for a previously-appended leaf against
    /// the most recently anchored root that covers it.
    /// </summary>
    /// <param name="leafIndex">Leaf index returned from <see cref="AppendAsync"/>.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Inclusion proof or <c>null</c> if no anchor yet covers this leaf.</returns>
    /// <exception cref="NotImplementedException">
    /// Thrown in v0.1. Lands in v0.5 — see MILESTONES.md.
    /// </exception>
    Task<MerkleProof?> GetProofAsync(long leafIndex, CancellationToken cancellationToken);

    /// <summary>
    /// Look up the published root anchor for a given UTC date.
    /// </summary>
    /// <param name="utcDate">Anchor date in <c>YYYY-MM-DD</c>.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The most recent root anchor on or before that date, or <c>null</c>.</returns>
    /// <exception cref="NotImplementedException">
    /// Thrown in v0.1. Lands in v0.5 — see MILESTONES.md.
    /// </exception>
    Task<RootAnchor?> GetAnchorAsync(DateOnly utcDate, CancellationToken cancellationToken);
}

/// <summary>
/// A published Merkle root anchor.
/// </summary>
/// <param name="UtcDate">Anchor date.</param>
/// <param name="RootHash">BLAKE2b-256 of the tree root, hex-encoded.</param>
/// <param name="LeafCount">Number of leaves covered by this root.</param>
/// <param name="PublishedAtUtc">When the anchor was first written publicly.</param>
public sealed record RootAnchor(
    DateOnly UtcDate,
    string RootHash,
    long LeafCount,
    DateTimeOffset PublishedAtUtc);
