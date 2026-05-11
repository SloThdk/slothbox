// Sender-side share registry.
//
// Stores the minimum state needed to RE-AUTHENTICATE against the
// destroy endpoint after the upload tab is closed. Everything in this
// file lives in `localStorage` under the SlothBox origin — there is no
// server-side mirror of the data (the trust thesis forbids it: the
// raw revoke token only exists on the sender's device, otherwise the
// server could revoke shares without sender consent).
//
// Schema is versioned so a future change (e.g. adding a per-share
// label, a sent-to recipient hint) can migrate forward without
// blowing away previously-stored entries.
//
// SECURITY NOTES:
//   - The raw revoke token IS sensitive — anyone reading this
//     `localStorage` slot can destroy the shares listed here. We
//     scope to the origin (browser-enforced), refuse to render on
//     server-side (the file is "use client" only via consumer), and
//     never log token bytes.
//   - The URL fragment (`#key=…`) is NOT stored here. If a sender
//     wants to recover a share's decryption key, they must keep the
//     original `shareUrl` — the same constraint as v0.1 with no
//     sender-side history.
//   - There's no integrity protection on this store. A malicious
//     extension or a "save my data" sync to a hostile device can read
//     it. That's the same trust boundary as Chrome saved passwords —
//     the OS / browser is the protection.

const STORAGE_KEY = "slothbox.myShares.v1";

/**
 * Per-share metadata persisted on the sender's device. Only the bare
 * minimum to identify and revoke the share — no URL fragment, no
 * password (the password is the user's responsibility to remember;
 * we never have it).
 */
export interface MySharesEntry {
  /** Public short ID — what travels in the URL path segment. */
  shortId: string;
  /** Base64url of the 32-byte revoke token. The bearer credential. */
  revokeToken: string;
  /**
   * Human-readable filename, recovered from the encrypted-metadata
   * blob the sender just encrypted. Useful for the dashboard list;
   * NEVER sent anywhere.
   */
  fileName: string;
  /** Plaintext file size in bytes — for the list rendering only. */
  fileSize: number;
  /** ISO-8601 timestamp of share-create. */
  createdAt: string;
  /** ISO-8601 timestamp of server-side expiry. */
  expiresAt: string;
  /** Mirrored from the share options for the dashboard summary line. */
  burnAfterRead: boolean;
  /** Mirrored from the share options for the dashboard summary line. */
  passwordProtected: boolean;
}

/**
 * Wire shape inside `localStorage`. Versioned so a future schema
 * change can be handled without nuking the stored data.
 */
interface PersistedV1 {
  version: 1;
  entries: MySharesEntry[];
}

/**
 * Safe `localStorage` read. Returns an empty list when:
 *   - we're not running in a browser (SSR / Node — no `window`)
 *   - the storage slot is empty
 *   - the JSON is malformed (treated as a fresh slate; we'd rather
 *     drop a broken entry than crash the dashboard)
 *   - the persisted version doesn't match (forward-compat for v2+)
 */
export function readShares(): MySharesEntry[] {
  if (typeof window === "undefined") return [];
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // SecurityError when localStorage is disabled (private mode in
    // some browsers, host policies). Treat as no-data.
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    return [];
  }
  const entries = (parsed as PersistedV1).entries;
  // Validate every entry — drop any that are missing the load-bearing
  // fields. A surviving 9/10 is better than a 0/10 because of one bad
  // row, and the dashboard already handles an empty list cleanly.
  return entries.filter(
    (e): e is MySharesEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof e.shortId === "string" &&
      typeof e.revokeToken === "string" &&
      typeof e.fileName === "string" &&
      typeof e.fileSize === "number" &&
      typeof e.createdAt === "string" &&
      typeof e.expiresAt === "string" &&
      typeof e.burnAfterRead === "boolean" &&
      typeof e.passwordProtected === "boolean"
  );
}

function writeShares(entries: MySharesEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedV1 = { version: 1, entries };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // QuotaExceededError or SecurityError — best-effort store. The
    // sender's next destroy attempt will land on "no entry found" and
    // they'll be told the share is no longer locally revocable.
  }
}

/**
 * Append a new share to the registry. Idempotent on shortId — if a
 * second call lands the same shortId (re-upload of a recovered token,
 * or a quirky race), the existing entry is updated in place rather
 * than duplicated.
 */
export function addShare(entry: MySharesEntry): void {
  const list = readShares().filter((e) => e.shortId !== entry.shortId);
  list.unshift(entry); // newest first
  writeShares(list);
}

/**
 * Remove a share from the registry. Called after a successful
 * revoke or when the dashboard's "remove from this device" button
 * is clicked (e.g. for a share known-to-be-expired).
 */
export function removeShare(shortId: string): void {
  const list = readShares().filter((e) => e.shortId !== shortId);
  writeShares(list);
}

/**
 * Drop entries whose `expiresAt` is in the past. Cheap to run at
 * dashboard mount-time so the list isn't cluttered with shares the
 * server already pruned.
 */
export function pruneExpired(now: number = Date.now()): MySharesEntry[] {
  const list = readShares();
  const live = list.filter((e) => {
    const t = new Date(e.expiresAt).getTime();
    return Number.isFinite(t) && t > now;
  });
  if (live.length !== list.length) {
    writeShares(live);
  }
  return live;
}
