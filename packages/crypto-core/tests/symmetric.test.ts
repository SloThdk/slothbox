import { describe, it, expect, beforeAll } from "vitest";
import {
  CHUNK_TOKEN_LABEL,
  initCrypto,
  generateKey,
  generateNonce,
  encryptChunk,
  decryptChunk,
  buildChunkAad,
  deriveChunkToken,
  hashBytes,
  hashChunks,
  KEY_BYTES,
  NONCE_BYTES,
  TAG_BYTES,
} from "../src/index.js";

beforeAll(async () => {
  await initCrypto();
});

describe("symmetric encryption (XChaCha20-Poly1305)", () => {
  it("generates keys of the correct size", async () => {
    const k = await generateKey();
    expect(k.length).toBe(KEY_BYTES);
  });

  it("generates nonces of the correct size", async () => {
    const n = await generateNonce();
    expect(n.length).toBe(NONCE_BYTES);
  });

  it("round-trips: decrypt(encrypt(x)) === x", async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const aad = buildChunkAad("share-abc", 0);
    const plaintext = new TextEncoder().encode("hello, world. this is a test message.");

    const ciphertext = await encryptChunk({ plaintext, key, nonce, aad });
    expect(ciphertext.length).toBe(plaintext.length + TAG_BYTES);

    const decrypted = await decryptChunk({ ciphertext, key, nonce, aad });
    expect(new TextDecoder().decode(decrypted)).toBe("hello, world. this is a test message.");
  });

  it("fails to decrypt with wrong key", async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const nonce = await generateNonce();
    const aad = buildChunkAad("share-abc", 0);
    const plaintext = new Uint8Array([1, 2, 3, 4]);

    const ciphertext = await encryptChunk({ plaintext, key: key1, nonce, aad });
    await expect(decryptChunk({ ciphertext, key: key2, nonce, aad })).rejects.toThrow();
  });

  it("fails to decrypt with wrong nonce", async () => {
    const key = await generateKey();
    const nonce1 = await generateNonce();
    const nonce2 = await generateNonce();
    const aad = buildChunkAad("share-abc", 0);
    const plaintext = new Uint8Array([1, 2, 3, 4]);

    const ciphertext = await encryptChunk({ plaintext, key, nonce: nonce1, aad });
    await expect(decryptChunk({ ciphertext, key, nonce: nonce2, aad })).rejects.toThrow();
  });

  it("fails to decrypt with wrong AAD (binding to share+chunk works)", async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const aadCorrect = buildChunkAad("share-abc", 0);
    const aadWrong = buildChunkAad("share-xyz", 0);
    const plaintext = new Uint8Array([1, 2, 3, 4]);

    const ciphertext = await encryptChunk({ plaintext, key, nonce, aad: aadCorrect });
    await expect(decryptChunk({ ciphertext, key, nonce, aad: aadWrong })).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const aad = buildChunkAad("share-abc", 0);
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const ciphertext = await encryptChunk({ plaintext, key, nonce, aad });
    ciphertext[0] = (ciphertext[0]! ^ 0xff) & 0xff;

    await expect(decryptChunk({ ciphertext, key, nonce, aad })).rejects.toThrow();
  });
});

describe("hashing (BLAKE2b-256)", () => {
  it("produces 32-byte digests", async () => {
    const h = await hashBytes(new Uint8Array([1, 2, 3]));
    expect(h.length).toBe(32);
  });

  it("is deterministic", async () => {
    const input = new TextEncoder().encode("repeatable");
    const a = await hashBytes(input);
    const b = await hashBytes(input);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("differs for different inputs", async () => {
    const a = await hashBytes(new TextEncoder().encode("foo"));
    const b = await hashBytes(new TextEncoder().encode("bar"));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("deriveChunkToken (single-use chunk capabilities)", () => {
  it("produces 32-byte tokens (SHA-256 output)", async () => {
    const fragmentKey = await generateKey();
    const token = await deriveChunkToken({ fragmentKey, shortId: "abc12345xyz1", chunkIndex: 0 });
    expect(token.length).toBe(32);
  });

  it("is deterministic for the same inputs (both sides converge)", async () => {
    const fragmentKey = await generateKey();
    const a = await deriveChunkToken({ fragmentKey, shortId: "abc12345xyz1", chunkIndex: 3 });
    const b = await deriveChunkToken({ fragmentKey, shortId: "abc12345xyz1", chunkIndex: 3 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("differs across chunk indices for the same fragmentKey + shortId", async () => {
    const fragmentKey = await generateKey();
    const t0 = await deriveChunkToken({ fragmentKey, shortId: "abc12345xyz1", chunkIndex: 0 });
    const t1 = await deriveChunkToken({ fragmentKey, shortId: "abc12345xyz1", chunkIndex: 1 });
    expect(Array.from(t0)).not.toEqual(Array.from(t1));
  });

  it("differs across shortIds for the same fragmentKey + chunkIndex", async () => {
    const fragmentKey = await generateKey();
    const tA = await deriveChunkToken({ fragmentKey, shortId: "abc12345xyz1", chunkIndex: 0 });
    const tB = await deriveChunkToken({ fragmentKey, shortId: "def67890pqr2", chunkIndex: 0 });
    expect(Array.from(tA)).not.toEqual(Array.from(tB));
  });

  it("differs across fragmentKeys for the same shortId + chunkIndex", async () => {
    const t1 = await deriveChunkToken({
      fragmentKey: await generateKey(),
      shortId: "abc12345xyz1",
      chunkIndex: 0,
    });
    const t2 = await deriveChunkToken({
      fragmentKey: await generateKey(),
      shortId: "abc12345xyz1",
      chunkIndex: 0,
    });
    expect(Array.from(t1)).not.toEqual(Array.from(t2));
  });

  it("rejects wrong-size fragmentKey", async () => {
    await expect(
      deriveChunkToken({
        fragmentKey: new Uint8Array(16),
        shortId: "abc12345xyz1",
        chunkIndex: 0,
      })
    ).rejects.toThrow(/fragmentKey must be 32 bytes/);
  });

  it("uses the documented domain-separation label", () => {
    // Guard against accidental label drift — if anyone bumps "v1" → "v2",
    // every existing chunk token in flight becomes invalid, so this is
    // a conscious-decision sentinel.
    const expected = new TextEncoder().encode("slothbox-chunk-token-v1");
    expect(Array.from(CHUNK_TOKEN_LABEL)).toEqual(Array.from(expected));
  });
});

describe("hashChunks (whole-file integrity / truncation detection)", () => {
  it("equals hashBytes over the concatenation of the chunks", async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([6, 7, 8]);
    const c = new Uint8Array([9, 10, 11, 12]);
    const whole = new Uint8Array([...a, ...b, ...c]);

    const streamed = await hashChunks([a, b, c]);
    const oneShot = await hashBytes(whole);

    expect(streamed.length).toBe(32);
    expect(Array.from(streamed)).toEqual(Array.from(oneShot));
  });

  it("is unaffected by chunk boundaries (same bytes, different splits)", async () => {
    const splitA = await hashChunks([new Uint8Array([1, 2, 3, 4, 5, 6])]);
    const splitB = await hashChunks([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
    expect(Array.from(splitA)).toEqual(Array.from(splitB));
  });

  it("detects a dropped trailing chunk — the silent-truncation case", async () => {
    // A server that drops the last chunk yields a different whole-file hash, so
    // the receiver's post-reassembly comparison (download.ts) catches the
    // truncation that per-chunk AEAD alone cannot.
    const full = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), new Uint8Array([7, 8, 9])];
    const truncated = full.slice(0, 2);

    const fullHash = await hashChunks(full);
    const truncatedHash = await hashChunks(truncated);

    expect(Array.from(truncatedHash)).not.toEqual(Array.from(fullHash));
  });

  it("hashes an empty chunk list deterministically", async () => {
    const h1 = await hashChunks([]);
    const h2 = await hashBytes(new Uint8Array(0));
    expect(Array.from(h1)).toEqual(Array.from(h2));
  });
});
