/**
 * WebSocket /ws/progress?shareId=...
 *
 * v0.1 contract (deliberately minimal):
 *   - Client opens WS, server upgrades.
 *   - Client sends `{ chunkIndex, status }` per chunk; server validates
 *     and echoes back `{ ok: true, chunkIndex, status }`.
 *   - Server emits `{ type: "ack", at }` heartbeats every 30s.
 *
 * v0.5 expansion: subscribe to a NATS subject keyed by shareId and
 * fan progress updates out across all gateway instances so dashboards
 * can mirror upload state. The subject naming is reserved here:
 *   slothbox.share.<shareId>.progress
 *
 * SECURITY: shareId in the query string is checked for the same
 * format Zod accepts on REST routes. Anything else is closed
 * immediately. We do NOT yet verify the shareId actually exists in
 * the DB — coming in v0.5 with auth.
 */

import { z } from "zod";
import type { WSContext } from "hono/ws";
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import { logger } from "../lib/logger.js";

/**
 * Build a {@link createNodeWebSocket}-compatible upgrade handler and
 * attach it to the supplied Hono app under `/ws/progress`.
 *
 * The function returns the `injectWebSocket` callback the entry
 * point must invoke against the Node `Server` after `serve()`.
 */
export function attachProgressWs(app: Hono): {
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
} {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Body of every text frame we accept from the client.
  const ProgressFrameSchema = z.object({
    chunkIndex: z.number().int().nonnegative().max(100_000),
    status: z.enum(["uploading", "complete"]),
  });

  // 60-byte cap on inbound frame size — defends against memory abuse
  // through a never-ending text stream. JSON for valid payloads is
  // always under 50 bytes.
  const MAX_FRAME_BYTES = 256;

  // Hono's typing for upgradeWebSocket assumes a string return; we
  // disable the standard validation guard and inline the shareId
  // check.
  const SHARE_ID = /^[A-Za-z0-9_-]{1,64}$/;

  app.get(
    "/ws/progress",
    upgradeWebSocket((c) => {
      const shareId = c.req.query("shareId");
      const requestId = (c.get("requestId" as never) as string | undefined) ?? "ws";

      if (!shareId || !SHARE_ID.test(shareId)) {
        // Reject early: the WS adapter will still complete the
        // upgrade handshake with the events we hand back, so we
        // close inside onOpen.
        return {
          onOpen(_evt: unknown, ws: WSContext) {
            ws.close(1008, "missing or invalid shareId");
          },
          onClose() {
            // Empty by design — onOpen already closed the socket.
          },
        };
      }

      // 30s heartbeat so idle proxies don't kill the connection.
      let heartbeat: NodeJS.Timeout | null = null;

      return {
        onOpen(_evt: unknown, ws: WSContext) {
          logger.debug({ requestId, shareId, event: "ws_open" }, "ws opened");
          heartbeat = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: "ack", at: Date.now() }));
            } catch (err) {
              logger.warn(
                { requestId, err: { message: (err as Error).message } },
                "ws heartbeat send failed"
              );
            }
          }, 30_000);
          ws.send(JSON.stringify({ type: "hello", shareId }));
        },
        onMessage(evt: MessageEvent, ws: WSContext) {
          const raw = typeof evt.data === "string" ? evt.data : null;
          if (raw === null) {
            ws.close(1003, "binary frames not supported");
            return;
          }
          if (raw.length > MAX_FRAME_BYTES) {
            ws.close(1009, "frame too large");
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            ws.send(JSON.stringify({ ok: false, error: "invalid JSON" }));
            return;
          }

          const result = ProgressFrameSchema.safeParse(parsed);
          if (!result.success) {
            ws.send(
              JSON.stringify({
                ok: false,
                error: "invalid frame",
                details: result.error.issues.map((i) => i.message),
              })
            );
            return;
          }

          // v0.1: echo back. v0.5: publish to NATS subject
          // `slothbox.share.<shareId>.progress` for cross-instance
          // fan-out.
          ws.send(
            JSON.stringify({
              ok: true,
              chunkIndex: result.data.chunkIndex,
              status: result.data.status,
            })
          );
        },
        onClose() {
          if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
          }
          logger.debug({ requestId, shareId, event: "ws_close" }, "ws closed");
        },
        onError(err: Event) {
          logger.warn(
            {
              requestId,
              shareId,
              err: {
                message:
                  (err as unknown as { message?: string }).message ??
                  "ws error event",
              },
            },
            "ws error"
          );
        },
      };
    })
  );

  return { injectWebSocket };
}
