/**
 * Unit test for the idempotency contract of the legacy
 * `POST /api/shares/:shortId/downloaded` endpoint after migration 0004.
 *
 * The endpoint is no longer load-bearing for the burn decision — the
 * ingest service's `mark_chunk_served` SQL function is the canonical
 * burn trigger now. But many in-the-wild client builds still POST to
 * /downloaded after a successful decrypt, and we don't want them to see
 * a confusing 404 just because the server-side burn won the race.
 *
 * Three contract guarantees we test for:
 *
 *   1. If the share is already in a terminal state (destroyed/expired),
 *      the endpoint returns 200 with the current state — NOT 404.
 *
 *   2. If `increment_download` raises 'share not available' (which
 *      happens when state slips between our existence check and the
 *      RPC call — i.e. ingest's burn fired in the gap), the endpoint
 *      catches that exception and returns 200 with state='destroyed',
 *      NOT a 500 or 404.
 *
 *   3. If the share is genuinely missing (no row at all), the endpoint
 *      still returns 404 — the idempotency softening doesn't paper
 *      over real "share never existed" cases.
 *
 * The test exercises the route handler with a stub Drizzle client so
 * the assertions don't depend on a running Postgres. The full
 * end-to-end path against a real DB lives in
 * `docs/BURN_SMOKE_TEST.md` and runs against `docker compose up`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

// We import the router builder by stubbing every dep it pulls in. The
// router itself is pure — it composes Hono middleware that depends on
// `getDb`, `rateLimit`, audit/metric/NATS helpers — none of which we
// want to actually run here.

// ---------------------------------------------------------------------
// Stubs for module deps. Hoisted so vi.mock factories can see them.
// ---------------------------------------------------------------------

const { mockDb, mockExecute, mockNats, mockMetricInc } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), execute: vi.fn(), insert: vi.fn(), update: vi.fn() },
  mockExecute: vi.fn(),
  mockNats: vi.fn().mockResolvedValue(null),
  mockMetricInc: vi.fn(),
}));

vi.mock("@slothbox/db", () => ({
  getDb: () => mockDb,
  shares: {
    id: "id",
    shortId: "short_id",
    state: "state",
  },
  // The router only references type-erased fields; the exact shape
  // doesn't matter for the assertions. Re-exported here to keep the
  // import surface compatible.
}));

vi.mock("../src/lib/config.js", () => ({
  config: {
    INGEST_PUBLIC_URL: "http://localhost/ingest",
    MAX_FILE_SIZE_BYTES: 4_294_967_296,
    MAX_CHUNK_SIZE_BYTES: 10_485_760,
    MAX_SHARE_TTL_DAYS: 7,
    RATE_LIMIT_CREATE_PER_MINUTE: 10,
    RATE_LIMIT_CREATE_PER_DAY: 100,
    RATE_LIMIT_READ_PER_MINUTE: 120,
  },
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../src/lib/nats.js", () => ({
  getNats: mockNats,
}));

vi.mock("../src/middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../src/lib/metrics.js", () => ({
  sharesCreatedTotal: { inc: mockMetricInc },
  sharesDestroyedTotal: { inc: mockMetricInc },
  sharesFetchedTotal: { inc: mockMetricInc },
}));

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Wire a request-id middleware in front of the router so `c.get("requestId")`
 * inside the handler doesn't blow up. The real one comes from
 * `apps/api-gateway/src/middleware/requestId.ts`; we mock just enough
 * surface for the route to read the value.
 */
function mountRouter(router: Hono): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("requestId", "test-request-id");
    await next();
  });
  app.route("/api", router);
  return app;
}

/**
 * Mock the Drizzle SELECT pipeline used by the idempotency phase-1 read.
 * The real route does:
 *   db.select({...}).from(shares).where(eq(shares.shortId, shortId)).limit(1)
 * Each method returns a chainable; we yield the supplied row at the end.
 */
function stubSelect(row: { id: string; state: string } | undefined): void {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mockDb.select.mockReturnValueOnce({ from });
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

describe("POST /api/shares/:shortId/downloaded — idempotency post-0004", () => {
  let app: Hono;

  const VALID_SHORT_ID = "abcdefghjkmn"; // 12 chars from SHORT_ID_ALPHABET

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.execute.mockReset();
    // Re-import the router fresh per test so the mocks bind cleanly.
    vi.resetModules();
    const { sharesRouter } = await import("../src/routes/shares.js");
    app = mountRouter(sharesRouter());
  });

  it("returns 200 with state=destroyed when the share is already destroyed (server-side burn won)", async () => {
    stubSelect({ id: "share-uuid-1", state: "destroyed" });

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("destroyed");

    // Should NOT have called increment_download — idempotency phase 1
    // short-circuited before the RPC.
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("returns 200 with state=expired when the share has expired", async () => {
    stubSelect({ id: "share-uuid-2", state: "expired" });

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("expired");
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("returns 200 with state=destroyed when increment_download raises 'share not available' (mid-call race)", async () => {
    // Phase 1 sees state='ready' — share looks live.
    stubSelect({ id: "share-uuid-3", state: "ready" });
    // Phase 2 calls the RPC, which raises because ingest's burn fired
    // between phase 1 and phase 2.
    mockDb.execute.mockRejectedValueOnce(new Error("share not available"));

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("destroyed");
  });

  it("returns 404 when the share genuinely does not exist", async () => {
    stubSelect(undefined);

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    expect(res.status).toBe(404);
  });

  it("propagates non-'share not available' RPC errors as 500 (untouched by idempotency softening)", async () => {
    stubSelect({ id: "share-uuid-4", state: "ready" });
    mockDb.execute.mockRejectedValueOnce(new Error("connection refused"));

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    // Real RPC failures still surface — we don't want to mask infra
    // problems behind a 200.
    expect(res.status).toBe(500);
  });

  it("happy path: ready share with a successful increment_download still returns 200 with the new state", async () => {
    stubSelect({ id: "share-uuid-5", state: "ready" });
    // Simulate increment_download returning a non-burn outcome
    // (download_count bumped, state stays 'ready' because
    // burn_after_read=false and max_downloads not reached).
    mockDb.execute.mockResolvedValueOnce([
      { id: "share-uuid-5", state: "ready", burnAfterRead: false },
    ]);

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("ready");
  });

  it("happy path: ready burn-after-read share fires the burn via the gateway path (rare race)", async () => {
    stubSelect({ id: "share-uuid-6", state: "ready" });
    // Polite POST won the race against ingest's mark_chunk_served —
    // increment_download flipped state to destroyed.
    mockDb.execute.mockResolvedValueOnce([
      { id: "share-uuid-6", state: "destroyed", burnAfterRead: true },
    ]);

    const res = await app.request(`/api/shares/${VALID_SHORT_ID}/downloaded`, { method: "POST" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("destroyed");
  });
});
