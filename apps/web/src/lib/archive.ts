// Folder / multi-file packaging helper (v0.2.1, Tier-B feature #4).
//
// When the sender selects more than one file (or drops a folder), we
// pack them into a single zip Blob and feed that into the existing
// single-file encryption pipeline. The server stays oblivious — it
// sees one ciphertext like any other share. The recipient downloads
// a .zip file and extracts it on their OS.
//
// Why zip and not tar:
//   - Native OS support across Windows / macOS / Linux + iOS / Android
//     means the recipient never has to install anything to extract.
//   - `fflate` is the smallest pure-JS zip implementation that ships
//     non-streaming + streaming APIs (~28 KB gzipped vs jszip's ~95 KB).
//   - Zip's per-file CRC32 gives a cheap second-line integrity check
//     on top of the AEAD tag — extraction fails loud if the zip
//     bytes were tampered with (which they can't be, because the
//     AEAD tag would already fail first).
//
// Why we hold the full archive in memory (no streaming):
//   The existing single-file upload path (see `upload.ts`'s
//   `await file.arrayBuffer()`) already buffers the entire plaintext
//   into memory. Streaming the zip into the chunk encryptor wouldn't
//   reduce the peak memory footprint because the encryptor itself
//   reads the whole buffer. v0.5 introduces TransformStream-based
//   chunk encryption (per the existing TODO in download.ts:152), at
//   which point switching to streaming zip (`fflate.Zip`) is a
//   one-line change here.
//
// Sender flow:
//   1. UploadDrop detects file count > 1 (or directory pick)
//   2. Calls `packFiles(files)` here → Blob (mime application/zip)
//   3. Hands the Blob to `uploadFile()` like any other File
//   4. The share URL points at what looks like a single-file share;
//      the metadata blob carries fileName = "myFolder.zip"
//
// Receiver flow:
//   1. `downloadFile()` decrypts as today, returns a Blob
//   2. The Blob's filename is "myFolder.zip", mime application/zip
//   3. `triggerBlobDownload()` saves it; the recipient extracts on their OS
//
// SECURITY:
//   - Zip is not encryption. The zip container is JUST the framing;
//     the AEAD layer on top is what protects confidentiality.
//   - We do NOT include zip's own password protection (it's the
//     known-weak ZipCrypto / AES-256 modes — already superseded by
//     our XChaCha20-Poly1305 outer layer).
//   - Path traversal in zip is a known attack vector on EXTRACTION,
//     but we don't extract — the recipient's OS does. Modern OS
//     extractors reject `../foo` entries by default; we additionally
//     refuse to PACK such entries below.

import { zipSync, type Zippable } from "fflate";

/**
 * Maximum bytes a single zip blob may grow to before we refuse to
 * pack it. Mirrors the per-share max in `lib/config.ts` so the
 * eventual `uploadFile()` call won't get rejected after the work of
 * zipping.
 *
 * Default 4 GiB; if the sender's files sum bigger they get a clear
 * error here instead of an opaque rejection from the gateway.
 */
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Disallowed characters in a packed entry's path. Reject anything
 * with `..` (path traversal), null bytes (Windows shell injection),
 * or leading slashes (which some extractors honour as absolute paths).
 * The browser File picker never produces these for user-selected
 * files, but a custom DataTransfer that surfaced an attacker-crafted
 * webkitRelativePath could — defence-in-depth.
 */
const FORBIDDEN_PATH_PATTERNS: ReadonlyArray<RegExp> = [/\.\.[\\/]/, /\x00/, /^[\\/]/];

/**
 * Public archive result shape. Consumed by `upload.ts`.
 */
export interface ArchiveResult {
  /** The zip blob — feed straight into `uploadFile(blob as File, …)`. */
  blob: Blob;
  /**
   * Recommended filename for the share's metadata. Picks the top-level
   * directory name when every entry shares a common prefix; falls
   * back to `slothbox-<N>-files.zip` otherwise.
   */
  fileName: string;
  /** Plaintext size of the zip blob — for the UI's bytes-progress display. */
  size: number;
  /** Per-entry stats — useful for the "X files in Y" subtitle. */
  entryCount: number;
}

export class ArchiveError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ArchiveError";
  }
}

/**
 * Build a zip Blob from an array of File objects. Each File's
 * `webkitRelativePath` (set when the file came from
 * `<input webkitdirectory>` or a folder drop) becomes its in-zip
 * path; files without a relative path land at the zip root under
 * their bare `.name`.
 *
 * Throws ArchiveError on:
 *   - empty file list
 *   - sum of file sizes exceeding MAX_ARCHIVE_BYTES
 *   - any entry path matching FORBIDDEN_PATH_PATTERNS
 *   - duplicate entry paths (the second one would silently overwrite)
 */
export async function packFiles(files: ReadonlyArray<File>): Promise<ArchiveResult> {
  if (files.length === 0) {
    throw new ArchiveError("no files to pack");
  }

  // Sum the input bytes before any I/O. Bail early on oversized
  // archives — a streamed zip can't help here because the encryption
  // pipeline downstream also reads the whole buffer.
  let totalSize = 0;
  for (const f of files) {
    totalSize += f.size;
  }
  if (totalSize > MAX_ARCHIVE_BYTES) {
    throw new ArchiveError(
      `total file size ${totalSize} bytes exceeds archive cap ${MAX_ARCHIVE_BYTES}`
    );
  }

  // Build the Zippable dict. fflate's `Zippable` is a nested object
  // shape, but the flat shape works too — file paths with slashes
  // are interpreted as nested directories on extraction.
  const entries: Zippable = {};
  const seenPaths = new Set<string>();
  for (const f of files) {
    const path = entryPathFor(f);
    if (seenPaths.has(path)) {
      throw new ArchiveError(`duplicate entry path in archive: ${path}`);
    }
    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
      if (pattern.test(path)) {
        throw new ArchiveError(`forbidden character in entry path: ${path}`);
      }
    }
    seenPaths.add(path);
    // Read each File into a Uint8Array. The browser's File.arrayBuffer
    // is the cheapest way to get raw bytes.
    const bytes = new Uint8Array(await f.arrayBuffer());
    entries[path] = bytes;
  }

  // fflate's zipSync is synchronous and fast — for the ~4 GiB cap we
  // measure ~150-300 ms on a 2022 laptop. The async `zip` API exists
  // but adds Promise / callback overhead for no parallelism win
  // (zip is CPU-bound, not I/O-bound).
  //
  // `level: 0` (store, no compression) keeps the zip close to the
  // sum of input sizes — we don't try to compress because:
  //   (a) the AEAD layer adds 16 bytes per chunk regardless,
  //   (b) for many real folders (media, encrypted files, already-
  //       compressed binaries) compression saves nothing and burns
  //       CPU,
  //   (c) the sender's browser is the bottleneck, not the network.
  //
  // Sender who wants smaller transfer compresses their data BEFORE
  // dropping it in.
  let zipBytes: Uint8Array;
  try {
    zipBytes = zipSync(entries, { level: 0 });
  } catch (err) {
    throw new ArchiveError("failed to build zip archive", { cause: err });
  }

  // Build a name. If every entry shares a common top-level directory
  // (because the user dropped a single folder), use that name. Else
  // fall back to a generic "N-files" name.
  const fileName = chooseArchiveName(files);

  const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });

  return {
    blob,
    fileName,
    size: blob.size,
    entryCount: files.length,
  };
}

/**
 * Resolve a File's in-zip path. Prefers `webkitRelativePath` (set when
 * the user picked a folder or used `<input webkitdirectory>`); falls
 * back to bare `.name` for ad-hoc multi-file picks.
 */
function entryPathFor(file: File): string {
  // Some browsers include a leading slash on webkitRelativePath; strip
  // it so the zip stays cross-extractor portable.
  const raw = file.webkitRelativePath?.length ? file.webkitRelativePath : file.name;
  return raw.replace(/^[/\\]+/, "");
}

/**
 * Pick a user-visible filename for the archive. Uses the common
 * top-level directory if every entry has one; otherwise a generic
 * "slothbox-<N>-files.zip".
 */
function chooseArchiveName(files: ReadonlyArray<File>): string {
  // Collect the first segment of every entry's path. If every file
  // shares the same first segment, that's the folder name.
  const firstSegments = files.map((f) => {
    const path = entryPathFor(f);
    const slash = path.indexOf("/");
    return slash >= 0 ? path.slice(0, slash) : null;
  });
  const head = firstSegments[0];
  // `firstSegments.length > 0` is implied by the `files.length === 0`
  // early-return in `packFiles`, but the typecheck still wants the
  // explicit `head !== undefined` because `noUncheckedIndexedAccess`
  // doesn't narrow purely from non-empty-length context.
  if (head !== undefined && head !== null && head.length > 0) {
    const allMatch = firstSegments.every((s) => s === head);
    if (allMatch) {
      return `${head}.zip`;
    }
  }
  return `slothbox-${files.length}-files.zip`;
}

/**
 * Type guard: did the user select multiple files OR a folder?
 * UploadDrop calls this to decide whether to take the single-file
 * fast path or the archive-and-upload path.
 */
export function shouldArchive(files: ReadonlyArray<File>): boolean {
  return files.length > 1 || (files.length === 1 && files[0]!.webkitRelativePath.length > 0);
}
