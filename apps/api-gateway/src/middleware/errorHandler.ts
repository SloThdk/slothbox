/**
 * Centralised error handler.
 *
 * Hono's `app.onError` hook receives any error thrown from a route or
 * middleware. We translate it into a JSON envelope:
 *
 *   { error: { code, message, requestId } }
 *
 * SECURITY: never leak stack traces, internal SQL errors, or framework
 * messages to clients. Only `HTTPException` instances are surfaced
 * directly (the route layer constructs them with safe messages); every
 * other error becomes a generic 500.
 *
 * The full error always lands in the structured log with the request
 * ID, so operators can grep one line out of Loki without exposing
 * stack details to end users.
 */

import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../lib/logger.js";
import { httpRequestsTotal, statusClass } from "../lib/metrics.js";
import type { RequestIdVars } from "./requestId.js";

/** Hono env that error-handled routes always carry. */
type ErrorEnv = { Variables: RequestIdVars };

/** Shape of the JSON error envelope returned to clients. */
type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

/**
 * Build a Hono error handler. We export a factory rather than a
 * concrete handler so tests can inject a mock logger if needed.
 */
export const errorHandler: ErrorHandler<ErrorEnv> = (err, c: Context<ErrorEnv>) => {
  // The request-id middleware always runs first; if for any reason it
  // didn't (e.g. error inside the middleware itself before set), fall
  // back to a placeholder string so the response shape is stable.
  const requestId = c.get("requestId") ?? "unknown";
  const route = c.req.routePath ?? c.req.path;
  const method = c.req.method;

  // HTTPException — thrown by handlers for client-visible errors with
  // an explicit status. Trust the message, suppress the stack.
  if (err instanceof HTTPException) {
    const status = err.status;
    const code = mapStatusToCode(status);
    const body: ErrorEnvelope = {
      error: { code, message: err.message, requestId },
    };
    logger.info(
      {
        requestId,
        method,
        route,
        status,
        code,
        msg: err.message,
      },
      "request rejected"
    );
    httpRequestsTotal.inc({ method, route, status_class: statusClass(status) });
    return c.json(body, status);
  }

  // Anything else is unexpected — log full detail server-side, return
  // a generic message client-side. We deliberately do NOT echo
  // err.message; database driver errors leak schema and connection
  // metadata that an attacker would love.
  logger.error(
    {
      requestId,
      method,
      route,
      err: {
        name: (err as Error).name,
        message: (err as Error).message,
        stack: (err as Error).stack,
      },
    },
    "unhandled error in request"
  );
  const body: ErrorEnvelope = {
    error: {
      code: "internal_error",
      message: "An internal error occurred. Reference the request ID when reporting.",
      requestId,
    },
  };
  httpRequestsTotal.inc({ method, route, status_class: "5xx" });
  return c.json(body, 500);
};

/** Map an HTTP status to a stable, machine-readable code string. */
function mapStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 410:
      return "gone";
    case 413:
      return "payload_too_large";
    case 422:
      return "unprocessable";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "internal_error" : "client_error";
  }
}
