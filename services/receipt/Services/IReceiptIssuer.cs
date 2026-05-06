// SlothBox.Receipt — receipt issuer abstraction.
//
// The contract is fixed in v0.1 so the api-gateway side can begin coding
// against it (returning 501 on call) without further refactor. v0.5 will
// implement this against BouncyCastle.Tsp and Npgsql.

namespace SlothBox.Receipt.Services;

/// <summary>
/// Issues an RFC 3161 timestamped delivery receipt for a completed download.
///
/// <para>
/// Called by the api-gateway over the internal Docker network when an
/// authenticated download completes. The implementation:
/// </para>
/// <list type="number">
///   <item>POSTs the file hash to the configured TSA, gets a signed token.</item>
///   <item>Records the receipt as a leaf in the Merkle audit chain.</item>
///   <item>Persists the assembled receipt JSON in Postgres.</item>
///   <item>Returns the assembled receipt to the caller.</item>
/// </list>
///
/// <para>
/// v0.1 implementation is <see cref="StubReceiptIssuer"/> which throws
/// <see cref="System.NotImplementedException"/>. The HTTP endpoints layer
/// short-circuits to a 501 response before reaching the issuer, so this
/// interface is wired into DI but never actually invoked in v0.1.
/// </para>
/// </summary>
public interface IReceiptIssuer
{
    /// <summary>
    /// Issue a receipt for a single download event.
    /// </summary>
    /// <param name="request">
    /// Download metadata: shareId, file hash, file size, IP region. The
    /// caller must NOT pass identifying information beyond coarse region
    /// (see docs/RECEIPTS.md "What the receipt does NOT prove").
    /// </param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Assembled receipt envelope ready to return to the caller.</returns>
    /// <exception cref="System.NotImplementedException">
    /// Thrown in v0.1. Lands in v0.5 — see MILESTONES.md.
    /// </exception>
    Task<ReceiptEnvelope> IssueAsync(IssueReceiptRequest request, CancellationToken cancellationToken);

    /// <summary>
    /// Look up an already-issued receipt by its short id.
    /// </summary>
    /// <param name="shortId">Public short id (8-12 chars, share-link compatible).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The receipt if found; <c>null</c> if no receipt exists.</returns>
    /// <exception cref="System.NotImplementedException">
    /// Thrown in v0.1. Lands in v0.5 — see MILESTONES.md.
    /// </exception>
    Task<ReceiptEnvelope?> GetByShortIdAsync(string shortId, CancellationToken cancellationToken);
}

/// <summary>
/// Input to <see cref="IReceiptIssuer.IssueAsync"/>. Kept minimal so the
/// receipt cannot accidentally embed identifying data.
/// </summary>
/// <param name="ShareId">Public short id of the share.</param>
/// <param name="FileHash">
/// BLAKE2b-256 hash of the encrypted blob, prefixed
/// (e.g. <c>blake2b-256:e8b0f4...</c>). Required.
/// </param>
/// <param name="FileSize">Size in bytes of the encrypted blob.</param>
/// <param name="IpRegion">
/// Coarse region tag (e.g. <c>EU-DK</c>, <c>US-CA</c>) — never the raw IP.
/// </param>
public sealed record IssueReceiptRequest(
    string ShareId,
    string FileHash,
    long FileSize,
    string IpRegion);

/// <summary>
/// The assembled receipt returned to API consumers. Shape mirrors the JSON
/// in docs/RECEIPTS.md so the verifier CLI can parse the same bytes.
/// </summary>
/// <param name="Version">Receipt format version. Currently <c>"1"</c>.</param>
/// <param name="ShareId">Share short id.</param>
/// <param name="FileHash">Hash of the file. See <see cref="IssueReceiptRequest.FileHash"/>.</param>
/// <param name="FileSize">Size of the encrypted blob.</param>
/// <param name="DownloadedAtUtc">UTC instant the TSA timestamped.</param>
/// <param name="IpRegion">Coarse region tag.</param>
/// <param name="TsaTokenBase64">RFC 3161 token, base64-encoded.</param>
/// <param name="MerkleProof">Merkle inclusion proof against the published root.</param>
public sealed record ReceiptEnvelope(
    string Version,
    string ShareId,
    string FileHash,
    long FileSize,
    DateTimeOffset DownloadedAtUtc,
    string IpRegion,
    string TsaTokenBase64,
    MerkleProof MerkleProof);

/// <summary>
/// A Merkle inclusion proof for a single receipt leaf.
/// </summary>
/// <param name="LeafIndex">0-based leaf index in the audit chain.</param>
/// <param name="Siblings">
/// Co-path hashes from leaf to root, in order from the leaf upward.
/// </param>
/// <param name="RootHash">
/// Computed Merkle root the proof verifies against. Must match the
/// published anchor at <see cref="RootAnchorUrl"/>.
/// </param>
/// <param name="RootAnchorUrl">
/// Canonical public URL where this root was published at issuance time.
/// </param>
public sealed record MerkleProof(
    long LeafIndex,
    IReadOnlyList<string> Siblings,
    string RootHash,
    string RootAnchorUrl);
