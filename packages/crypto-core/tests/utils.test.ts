// Tests for utils.ts — encoding helpers, SHA-256, and the revoke-token
// generator. The encoding helpers are pure JS; SHA-256 and the token
// generator both touch real crypto primitives (WebCrypto and libsodium
// respectively) so the suite needs the libsodium init before running.

import { describe, it, expect, beforeAll } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToString,
  concatBytes,
  generateRevokeToken,
  sha256,
  stringToBytes,
  uint32ToBytesBE,
} from "../src/utils.js";
import { initCrypto } from "../src/index.js";

beforeAll(async () => {
  // generateRevokeToken uses libsodium; sha256 uses WebCrypto (no
  // init needed). One beforeAll covers both.
  await initCrypto();
});

describe("base64url round-trip", () => {
  it("round-trips an empty array", () => {
    expect(base64UrlToBytes(bytesToBase64Url(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it("round-trips a single byte across all 256 values", () => {
    for (let b = 0; b < 256; b++) {
      const input = new Uint8Array([b]);
      const out = base64UrlToBytes(bytesToBase64Url(input));
      expect(out).toEqual(input);
    }
  });

  it("emits no '+', '/', or '=' padding characters", () => {
    const encoded = bytesToBase64Url(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb]));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips a 256-byte value", () => {
    const input = new Uint8Array(256);
    for (let i = 0; i < 256; i++) input[i] = i;
    expect(base64UrlToBytes(bytesToBase64Url(input))).toEqual(input);
  });
});

describe("string ↔ bytes", () => {
  it("round-trips ASCII", () => {
    expect(bytesToString(stringToBytes("hello world"))).toBe("hello world");
  });

  it("round-trips emoji (multi-byte UTF-8)", () => {
    expect(bytesToString(stringToBytes("café · 🦥"))).toBe("café · 🦥");
  });
});

describe("concatBytes", () => {
  it("concatenates zero arrays into an empty Uint8Array", () => {
    expect(concatBytes()).toEqual(new Uint8Array(0));
  });

  it("preserves order and content across multiple inputs", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4]);
    const c = new Uint8Array([5, 6]);
    expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });
});

describe("uint32ToBytesBE", () => {
  it("encodes 0", () => {
    expect(uint32ToBytesBE(0)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it("encodes 1", () => {
    expect(uint32ToBytesBE(1)).toEqual(new Uint8Array([0, 0, 0, 1]));
  });

  it("encodes 2^32 - 1 (max u32) big-endian", () => {
    expect(uint32ToBytesBE(0xffffffff)).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  });

  it("encodes 0x01020304 in big-endian order", () => {
    expect(uint32ToBytesBE(0x01020304)).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
  });
});

describe("sha256", () => {
  it("produces 32-byte digests", async () => {
    const h = await sha256(new TextEncoder().encode("abc"));
    expect(h.length).toBe(32);
  });

  it("matches the SHA-256 of 'abc' from FIPS 180-2 (NIST test vector)", async () => {
    // ba7816bf 8f01cfea 414140de 5dae2223 b00361a3 96177a9c b410ff61 f20015ad
    const h = await sha256(new TextEncoder().encode("abc"));
    const hex = Array.from(h)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic", async () => {
    const input = new TextEncoder().encode("repeatable");
    const a = await sha256(input);
    const b = await sha256(input);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("differs for different inputs", async () => {
    const a = await sha256(new TextEncoder().encode("foo"));
    const b = await sha256(new TextEncoder().encode("bar"));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("generateRevokeToken", () => {
  it("produces 32-byte values", async () => {
    const t = await generateRevokeToken();
    expect(t.length).toBe(32);
  });

  it("is non-deterministic — two calls return different bytes", async () => {
    const a = await generateRevokeToken();
    const b = await generateRevokeToken();
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("revoke-token end-to-end (mint + commit + verify)", () => {
  it("simulates the full sender↔server flow", async () => {
    // Sender side
    const token = await generateRevokeToken();
    const commitment = await sha256(token);
    const commitmentB64 = bytesToBase64Url(commitment);

    // Server side: store base64url commitment, then receive a raw
    // token on revoke and hash-compare.
    const storedCommitment = base64UrlToBytes(commitmentB64);
    const incomingHash = await sha256(token);

    // Hash-equal: legitimate token verifies.
    expect(Array.from(incomingHash)).toEqual(Array.from(storedCommitment));

    // Hash-not-equal: a tampered token does NOT verify.
    const tampered = new Uint8Array(token);
    tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
    const tamperedHash = await sha256(tampered);
    expect(Array.from(tamperedHash)).not.toEqual(Array.from(storedCommitment));
  });
});
