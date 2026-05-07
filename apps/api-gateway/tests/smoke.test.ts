/**
 * Placeholder smoke test for @slothbox/api-gateway.
 *
 * vitest exits non-zero when no spec files are found, which would fail CI.
 * This single existence-test keeps the test runner happy until the real
 * route + middleware suites land in v0.5 (see MILESTONES.md).
 *
 * The real test plan, once implemented:
 *   - shares.ts CRUD (happy path + adversarial)
 *   - rate-limit middleware (Valkey-backed token bucket)
 *   - X-Slothbox-Nonce header propagation
 *   - audit chain hash continuity
 *   - WebSocket progress channel handshake
 */
import { describe, it, expect } from "vitest";

describe("@slothbox/api-gateway", () => {
  it("placeholder — real suites land in v0.5", () => {
    expect(1 + 1).toBe(2);
  });
});
