// SlothBox.Ingest — MinIO-backed implementation of IBlobStorage.
//
// We use the official `Minio` SDK. All long-lived state (the IMinioClient) is
// owned by this singleton; per-request state lives in the args records.
//
// Streaming: the SDK's PutObjectAsync supports a Stream + size, so we forward the
// PipeReader-backed stream directly. The MinIO server requires Content-Length up
// front (no chunked transfer in V4 signature mode), so the caller must know the
// size — we get it from the request's Content-Length header.

using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;
using Minio.Exceptions;
using SlothBox.Ingest.Configuration;

namespace SlothBox.Ingest.Services;

/// <summary>
/// MinIO-backed blob storage. Singleton-scoped; the underlying IMinioClient is
/// thread-safe and pools connections internally.
/// </summary>
public sealed class MinioBlobStorage : IBlobStorage
{
    private readonly IMinioClient _client;
    private readonly string _bucket;
    private readonly ILogger<MinioBlobStorage> _logger;

    public MinioBlobStorage(IOptions<IngestOptions> options, ILogger<MinioBlobStorage> logger)
    {
        var opts = options.Value;
        _bucket = opts.MinioBucket;
        _logger = logger;

        // Build the client. MinIO's "endpoint" is host[:port], no scheme.
        var builder = new MinioClient()
            .WithEndpoint(opts.MinioEndpoint)
            .WithCredentials(opts.MinioAccessKey, opts.MinioSecretKey)
            .WithRegion(opts.MinioRegion);

        if (opts.MinioUseSsl)
        {
            builder = builder.WithSSL();
        }

        _client = builder.Build();
    }

    /// <inheritdoc />
    public async Task PutAsync(
        string objectKey,
        Stream content,
        long contentLength,
        string contentType,
        CancellationToken ct)
    {
        var args = new PutObjectArgs()
            .WithBucket(_bucket)
            .WithObject(objectKey)
            .WithStreamData(content)
            .WithObjectSize(contentLength)
            .WithContentType(contentType);

        await _client.PutObjectAsync(args, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task GetAsync(
        string objectKey,
        Func<Stream, CancellationToken, Task> writer,
        CancellationToken ct)
    {
        // The Minio SDK pushes the response body into a callback rather than
        // returning a Stream; we wrap the user's writer to honour that contract.
        var args = new GetObjectArgs()
            .WithBucket(_bucket)
            .WithObject(objectKey)
            .WithCallbackStream(async (stream, innerCt) =>
            {
                await writer(stream, innerCt).ConfigureAwait(false);
            });

        await _client.GetObjectAsync(args, ct).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task DeleteAsync(string objectKey, CancellationToken ct)
    {
        try
        {
            var args = new RemoveObjectArgs()
                .WithBucket(_bucket)
                .WithObject(objectKey);

            await _client.RemoveObjectAsync(args, ct).ConfigureAwait(false);
        }
        catch (ObjectNotFoundException)
        {
            // Idempotent delete — already gone is success.
            _logger.LogDebug("DeleteAsync called for missing object {ObjectKey}", objectKey);
        }
    }

    /// <inheritdoc />
    public async Task<bool> ExistsAsync(string objectKey, CancellationToken ct)
    {
        try
        {
            var args = new StatObjectArgs()
                .WithBucket(_bucket)
                .WithObject(objectKey);

            await _client.StatObjectAsync(args, ct).ConfigureAwait(false);
            return true;
        }
        catch (ObjectNotFoundException)
        {
            return false;
        }
    }

    /// <inheritdoc />
    public async Task<bool> HealthCheckAsync(CancellationToken ct)
    {
        try
        {
            var args = new BucketExistsArgs().WithBucket(_bucket);
            return await _client.BucketExistsAsync(args, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // We deliberately swallow; health is a yes/no signal.
            _logger.LogWarning(ex, "MinIO health check failed");
            return false;
        }
    }
}
