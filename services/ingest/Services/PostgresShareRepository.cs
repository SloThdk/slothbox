// SlothBox.Ingest — Npgsql-backed implementation of IShareRepository.
//
// We use parameterised queries for everything (defence-in-depth even though
// shortId/chunkIndex are already validated by the routing layer). The shareId
// we pass to chunk inserts is a Guid we just SELECTed — never a client-supplied
// UUID — so there's no SQL-injection or IDOR surface here.

using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;
using SlothBox.Ingest.Configuration;
using SlothBox.Ingest.Models;

namespace SlothBox.Ingest.Services;

/// <summary>
/// Postgres-backed share + chunk persistence. Singleton-scoped; opens one
/// connection per call from the Npgsql connection pool.
/// </summary>
public sealed class PostgresShareRepository : IShareRepository
{
    private readonly string _connectionString;
    private readonly ILogger<PostgresShareRepository> _logger;

    public PostgresShareRepository(
        IOptions<IngestOptions> options,
        ILogger<PostgresShareRepository> logger)
    {
        _connectionString = options.Value.GetNpgsqlConnectionString();
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<Share?> GetShareByShortIdAsync(string shortId, CancellationToken ct)
    {
        const string sql =
            """
            SELECT id, short_id, state, chunk_count, chunk_size, expires_at
            FROM shares
            WHERE short_id = @shortId
            LIMIT 1
            """;

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct).ConfigureAwait(false);

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("shortId", shortId);

        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        if (!await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            return null;
        }

        return new Share
        {
            Id = reader.GetGuid(0),
            ShortId = reader.GetString(1),
            State = Share.ParseState(reader.GetString(2)),
            ChunkCount = reader.GetInt32(3),
            ChunkSize = reader.GetInt32(4),
            ExpiresAt = reader.GetFieldValue<DateTimeOffset>(5),
        };
    }

    /// <inheritdoc />
    public async Task UpsertChunkAsync(
        Guid shareId,
        int chunkIndex,
        byte[] nonce,
        string blobKey,
        int ciphertextSize,
        DateTimeOffset uploadedAt,
        CancellationToken ct)
    {
        // ON CONFLICT DO UPDATE so re-uploads of the same (share_id, chunk_index)
        // refresh the metadata. blob_key is deterministic but we still update
        // ciphertext_size + nonce + uploaded_at so the chunk row reflects the
        // latest successful upload.
        const string sql =
            """
            INSERT INTO share_chunks
                (share_id, chunk_index, nonce, blob_key, ciphertext_size, uploaded_at)
            VALUES
                (@shareId, @chunkIndex, @nonce, @blobKey, @ctSize, @uploadedAt)
            ON CONFLICT (share_id, chunk_index) DO UPDATE
            SET nonce           = EXCLUDED.nonce,
                blob_key        = EXCLUDED.blob_key,
                ciphertext_size = EXCLUDED.ciphertext_size,
                uploaded_at     = EXCLUDED.uploaded_at
            """;

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct).ConfigureAwait(false);

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("shareId", NpgsqlDbType.Uuid, shareId);
        cmd.Parameters.AddWithValue("chunkIndex", NpgsqlDbType.Integer, chunkIndex);
        cmd.Parameters.AddWithValue("nonce", NpgsqlDbType.Bytea, nonce);
        cmd.Parameters.AddWithValue("blobKey", NpgsqlDbType.Text, blobKey);
        cmd.Parameters.AddWithValue("ctSize", NpgsqlDbType.Integer, ciphertextSize);
        cmd.Parameters.AddWithValue("uploadedAt", NpgsqlDbType.TimestampTz, uploadedAt);

        await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<int> CountUploadedChunksAsync(Guid shareId, CancellationToken ct)
    {
        const string sql =
            "SELECT COUNT(*) FROM share_chunks WHERE share_id = @shareId AND uploaded_at IS NOT NULL";

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct).ConfigureAwait(false);

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("shareId", NpgsqlDbType.Uuid, shareId);

        var result = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        return Convert.ToInt32(result);
    }

    /// <inheritdoc />
    public async Task<bool> UpdateShareStateAsync(
        Guid shareId,
        ShareState newState,
        CancellationToken ct)
    {
        const string sql = "UPDATE shares SET state = @state WHERE id = @id";

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct).ConfigureAwait(false);

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("state", NpgsqlDbType.Text, ToSqlState(newState));
        cmd.Parameters.AddWithValue("id", NpgsqlDbType.Uuid, shareId);

        var rows = await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
        return rows > 0;
    }

    /// <inheritdoc />
    public async Task<Chunk?> GetChunkAsync(Guid shareId, int chunkIndex, CancellationToken ct)
    {
        const string sql =
            """
            SELECT share_id, chunk_index, nonce, blob_key, ciphertext_size, uploaded_at
            FROM share_chunks
            WHERE share_id = @shareId AND chunk_index = @chunkIndex
            LIMIT 1
            """;

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct).ConfigureAwait(false);

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("shareId", NpgsqlDbType.Uuid, shareId);
        cmd.Parameters.AddWithValue("chunkIndex", NpgsqlDbType.Integer, chunkIndex);

        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        if (!await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            return null;
        }

        return new Chunk
        {
            ShareId = reader.GetGuid(0),
            ChunkIndex = reader.GetInt32(1),
            Nonce = (byte[])reader.GetValue(2),
            BlobKey = reader.GetString(3),
            CiphertextSize = reader.GetInt32(4),
            UploadedAt = reader.IsDBNull(5) ? null : reader.GetFieldValue<DateTimeOffset>(5),
        };
    }

    /// <inheritdoc />
    public async Task<bool> HealthCheckAsync(CancellationToken ct)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct).ConfigureAwait(false);

            await using var cmd = new NpgsqlCommand("SELECT 1", conn);
            var result = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
            return result is int i && i == 1;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Postgres health check failed");
            return false;
        }
    }

    /// <summary>Map enum back to the schema-level TEXT value.</summary>
    private static string ToSqlState(ShareState state) => state switch
    {
        ShareState.Pending => "pending",
        ShareState.Uploading => "uploading",
        ShareState.Ready => "ready",
        ShareState.Downloaded => "downloaded",
        ShareState.Expired => "expired",
        ShareState.Destroyed => "destroyed",
        _ => throw new InvalidOperationException($"Unknown ShareState: {state}"),
    };
}
