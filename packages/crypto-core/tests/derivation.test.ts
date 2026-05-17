// Tests for derivation.ts — Argon2id + AEAD-key combiner.
//
// We test both primitives end-to-end against the real libsodium build (no
// mocks) so the same WASM that runs in production is exercised here. Tests
// are deliberately slow on the password-derivation path because Argon2id IS
// slow — that's the point. We use the smallest sane parameters in tests
// (`opsLimit=1`, `memLimit=8 MiB`) to keep CI under the per-job clock.

import { describe, it, expect, beforeAll } from "vitest";
import {
  AEAD_KDF_LABEL,
  AEAD_KEY_BYTES,
  DERIVED_KEY_BYTES,
  SALT_BYTES,
  deriveAeadKey,
  deriveKeyFromPassword,
  generateSalt,
} from "../src/derivation.js";
import {
  buildChunkAad,
  decryptChunk,
  encryptChunk,
  generateKey,
  generateNonce,
  initCrypto,
} from "../src/index.js";

beforeAll(async () => {
  await initCrypto();
});

// Cheap Argon2id parameters used only inside this test file. Production
// defaults are higher (see DEFAULT_OPS_LIMIT / DEFAULT_MEM_LIMIT_BYTES in
// derivation.ts). The numbers here are the lowest libsodium accepts.
const TEST_OPS = 1;
const TEST_MEM_BYTES = 8 * 1024 * 1024; // 8 MiB — libsodium minimum

describe("generateSalt", () => {
  it("produces 16-byte values", async () => {
    const s = await generateSalt();
    expect(s.length).toBe(SALT_BYTES);
  });

  it("is non-deterministic — two calls return different bytes", async () => {
    const a = await generateSalt();
    const b = await generateSalt();
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("deriveKeyFromPassword (Argon2id)", () => {
  it("produces 32-byte output", async () => {
    const salt = await generateSalt();
    const k = await deriveKeyFromPassword({
      password: "correct horse battery staple",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    expect(k.length).toBe(DERIVED_KEY_BYTES);
  });

  it("is deterministic for the same (password, salt, ops, mem)", async () => {
    const salt = await generateSalt();
    const args = {
      password: "deterministic",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    };
    const a = await deriveKeyFromPassword(args);
    const b = await deriveKeyFromPassword(args);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("differs across salts (cross-share isolation)", async () => {
    const password = "shared-password";
    const salt1 = await generateSalt();
    const salt2 = await generateSalt();
    const k1 = await deriveKeyFromPassword({
      password,
      salt: salt1,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const k2 = await deriveKeyFromPassword({
      password,
      salt: salt2,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });

  it("differs across passwords (right outcome on wrong guess)", async () => {
    const salt = await generateSalt();
    const k1 = await deriveKeyFromPassword({
      password: "alpha",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const k2 = await deriveKeyFromPassword({
      password: "beta",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });

  it("rejects wrong-size salt", async () => {
    await expect(
      deriveKeyFromPassword({
        password: "x",
        salt: new Uint8Array(8),
        opsLimit: TEST_OPS,
        memLimit: TEST_MEM_BYTES,
      })
    ).rejects.toThrow(/salt must be 16 bytes/);
  });

  it("rejects empty password", async () => {
    const salt = await generateSalt();
    await expect(
      deriveKeyFromPassword({
        password: "",
        salt,
        opsLimit: TEST_OPS,
        memLimit: TEST_MEM_BYTES,
      })
    ).rejects.toThrow(/password must not be empty/);
  });

  it("rejects passwords over MAX_PASSWORD_BYTES (4096) -- DoS prevention", async () => {
    // A 1 MB ASCII password would otherwise force Argon2id to hash a
    // megabyte of input on every guess; the cap fails the call early
    // before any KDF work happens.
    const salt = await generateSalt();
    const oversized = "a".repeat(4097);
    await expect(
      deriveKeyFromPassword({
        password: oversized,
        salt,
        opsLimit: TEST_OPS,
        memLimit: TEST_MEM_BYTES,
      })
    ).rejects.toThrow(/password too long/);
  });

  it("rejects multi-byte passwords whose UTF-8 length exceeds the cap", async () => {
    // String.length counts UTF-16 code units, not bytes. The 4096-byte
    // cap must be enforced against the encoded byte length, not the
    // .length value. A 1500-char string of 3-byte emoji encodes to
    // 4500 bytes UTF-8 -- under the .length threshold but over the
    // byte cap.
    const salt = await generateSalt();
    const multiByte = "あ".repeat(1500); // hiragana 'a' = 3 bytes UTF-8 each = 4500 bytes total
    await expect(
      deriveKeyFromPassword({
        password: multiByte,
        salt,
        opsLimit: TEST_OPS,
        memLimit: TEST_MEM_BYTES,
      })
    ).rejects.toThrow(/password too long/);
  });

  it("accepts passwords at exactly MAX_PASSWORD_BYTES (4096)", async () => {
    // Boundary test -- 4096 ASCII chars = 4096 UTF-8 bytes, exactly
    // at the cap. Should succeed.
    const salt = await generateSalt();
    const atCap = "a".repeat(4096);
    const key = await deriveKeyFromPassword({
      password: atCap,
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    expect(key.length).toBe(32);
  });
});

describe("deriveAeadKey (BLAKE2b-keyed combiner)", () => {
  it("returns fragmentKey unchanged when no password is provided", async () => {
    const fragmentKey = await generateKey();
    const aeadKey = await deriveAeadKey({ fragmentKey });
    expect(Array.from(aeadKey)).toEqual(Array.from(fragmentKey));
  });

  it("returns fragmentKey unchanged when passwordKey is null", async () => {
    const fragmentKey = await generateKey();
    const aeadKey = await deriveAeadKey({ fragmentKey, passwordKey: null });
    expect(Array.from(aeadKey)).toEqual(Array.from(fragmentKey));
  });

  it("returns a fresh array even on the no-password path (no aliasing)", async () => {
    const fragmentKey = await generateKey();
    const aeadKey = await deriveAeadKey({ fragmentKey });
    expect(aeadKey).not.toBe(fragmentKey);
    // Mutating the output must not mutate the input.
    aeadKey[0] = (aeadKey[0]! ^ 0xff) & 0xff;
    expect(aeadKey[0]).not.toBe(fragmentKey[0]);
  });

  it("differs from fragmentKey when a password key is mixed in", async () => {
    const fragmentKey = await generateKey();
    const passwordKey = await deriveKeyFromPassword({
      password: "secret",
      salt: await generateSalt(),
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const aeadKey = await deriveAeadKey({ fragmentKey, passwordKey });
    expect(aeadKey.length).toBe(AEAD_KEY_BYTES);
    expect(Array.from(aeadKey)).not.toEqual(Array.from(fragmentKey));
    expect(Array.from(aeadKey)).not.toEqual(Array.from(passwordKey));
  });

  it("is deterministic for the same (fragmentKey, passwordKey)", async () => {
    const fragmentKey = await generateKey();
    const passwordKey = await deriveKeyFromPassword({
      password: "deterministic",
      salt: await generateSalt(),
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const a = await deriveAeadKey({ fragmentKey, passwordKey });
    const b = await deriveAeadKey({ fragmentKey, passwordKey });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("differs when only the fragmentKey changes", async () => {
    const passwordKey = await deriveKeyFromPassword({
      password: "shared",
      salt: await generateSalt(),
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const k1 = await deriveAeadKey({ fragmentKey: await generateKey(), passwordKey });
    const k2 = await deriveAeadKey({ fragmentKey: await generateKey(), passwordKey });
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });

  it("differs when only the passwordKey changes", async () => {
    const fragmentKey = await generateKey();
    const salt = await generateSalt();
    const pk1 = await deriveKeyFromPassword({
      password: "alpha",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const pk2 = await deriveKeyFromPassword({
      password: "beta",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const k1 = await deriveAeadKey({ fragmentKey, passwordKey: pk1 });
    const k2 = await deriveAeadKey({ fragmentKey, passwordKey: pk2 });
    expect(Array.from(k1)).not.toEqual(Array.from(k2));
  });

  it("rejects wrong-size fragmentKey", async () => {
    await expect(deriveAeadKey({ fragmentKey: new Uint8Array(16) })).rejects.toThrow(
      /fragmentKey must be 32 bytes/
    );
  });

  it("rejects wrong-size passwordKey", async () => {
    const fragmentKey = await generateKey();
    await expect(deriveAeadKey({ fragmentKey, passwordKey: new Uint8Array(16) })).rejects.toThrow(
      /passwordKey must be 32 bytes/
    );
  });

  it("uses the documented domain-separation label", () => {
    // Belt-and-braces: if anyone ever changes the label, this test forces
    // a conscious decision about whether old shares need a re-mint path.
    // The byte sequence is the UTF-8 encoding of "slothbox-aead-kdf-v1".
    const expected = new TextEncoder().encode("slothbox-aead-kdf-v1");
    expect(Array.from(AEAD_KDF_LABEL)).toEqual(Array.from(expected));
  });
});

describe("end-to-end: encrypt with deriveAeadKey, decrypt with the right password", () => {
  it("round-trips a chunk when both sides derive the same AEAD key", async () => {
    const fragmentKey = await generateKey();
    const salt = await generateSalt();

    // Sender side
    const senderPwdKey = await deriveKeyFromPassword({
      password: "correct horse battery staple",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const senderAeadKey = await deriveAeadKey({ fragmentKey, passwordKey: senderPwdKey });

    const nonce = await generateNonce();
    const aad = buildChunkAad("share-pw", 0);
    const plaintext = new TextEncoder().encode("encrypted under both URL + password");
    const ciphertext = await encryptChunk({ plaintext, key: senderAeadKey, nonce, aad });

    // Recipient side, same password
    const recvPwdKey = await deriveKeyFromPassword({
      password: "correct horse battery staple",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const recvAeadKey = await deriveAeadKey({ fragmentKey, passwordKey: recvPwdKey });

    const decrypted = await decryptChunk({ ciphertext, key: recvAeadKey, nonce, aad });
    expect(new TextDecoder().decode(decrypted)).toBe("encrypted under both URL + password");
  });

  it("fails to decrypt with the wrong password (AEAD tag mismatch)", async () => {
    const fragmentKey = await generateKey();
    const salt = await generateSalt();

    const senderPwdKey = await deriveKeyFromPassword({
      password: "right",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const senderAeadKey = await deriveAeadKey({ fragmentKey, passwordKey: senderPwdKey });

    const nonce = await generateNonce();
    const aad = buildChunkAad("share-pw", 0);
    const ciphertext = await encryptChunk({
      plaintext: new TextEncoder().encode("hidden"),
      key: senderAeadKey,
      nonce,
      aad,
    });

    const wrongPwdKey = await deriveKeyFromPassword({
      password: "wrong",
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const wrongAeadKey = await deriveAeadKey({ fragmentKey, passwordKey: wrongPwdKey });

    await expect(decryptChunk({ ciphertext, key: wrongAeadKey, nonce, aad })).rejects.toThrow();
  });

  it("fails to decrypt with the right password but a tampered fragmentKey", async () => {
    const fragmentKey = await generateKey();
    const salt = await generateSalt();
    const password = "right";

    const senderPwdKey = await deriveKeyFromPassword({
      password,
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const senderAeadKey = await deriveAeadKey({ fragmentKey, passwordKey: senderPwdKey });

    const nonce = await generateNonce();
    const aad = buildChunkAad("share-pw", 0);
    const ciphertext = await encryptChunk({
      plaintext: new TextEncoder().encode("hidden"),
      key: senderAeadKey,
      nonce,
      aad,
    });

    // Attacker has the password but a different fragmentKey (URL was scrubbed
    // before delivery, or a brute-force guess). Decryption MUST fail.
    const attackerFragmentKey = await generateKey();
    const recvPwdKey = await deriveKeyFromPassword({
      password,
      salt,
      opsLimit: TEST_OPS,
      memLimit: TEST_MEM_BYTES,
    });
    const attackerAeadKey = await deriveAeadKey({
      fragmentKey: attackerFragmentKey,
      passwordKey: recvPwdKey,
    });

    await expect(decryptChunk({ ciphertext, key: attackerAeadKey, nonce, aad })).rejects.toThrow();
  });
});
