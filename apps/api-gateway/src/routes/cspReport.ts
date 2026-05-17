// CSP violation report endpoint.
//
// Browsers post Content-Security-Policy violation reports here when a
// page on the public origin tries to load / inline-execute a resource
// that the CSP forbids. In a properly-configured prod deploy this
// fires on:
//   - XSS attempts that try to inject inline <script> (blocked by the
//     nonce + strict-dynamic CSP from apps/web/src/middleware.ts)
//   - third-party scripts injected by a malicious browser extension
//   - integration regressions where a new feature adds an unallowed
//     resource and we want to find out via logs instead of debugging
//     a broken page
//
// The endpoint accepts both the legacy `application/csp-report` body
// shape AND the newer Reports API `application/reports+json` shape.
// We parse defensively -- a malformed body should never 500 the
// browser's reporting pipeline -- and surface structured fields to
// pino so Loki queries (`{service="api-gateway"} |= "CSP violation"`)
// catch the events.
//
// Rate-limiting: per-IP cap to prevent a malicious page or a script
// from flooding the endpoint with synthetic violations. The cap is
// generous (60 reports / IP / minute) because legitimate browsers
// can bundle several violations from a single page-load.

import { Hono } from "hono";
import { logger } from "../lib/logger.js";
import { rateLimit } from "../middleware/rateLimit.js";

/**
 * Shape of a single CSP report from the legacy `csp-report` body or the
 * `reports+json` body. Fields are all optional -- different browsers
 * surface different subsets, and the report-parser must tolerate that.
 */
type CspReportPayload = {
  "csp-report"?: {
    "document-uri"?: string;
    referrer?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "original-policy"?: string;
    disposition?: string;
    "blocked-uri"?: string;
    "line-number"?: number;
    "column-number"?: number;
    "source-file"?: string;
    "status-code"?: number;
    "script-sample"?: string;
  };
  // Reports API shape -- an array of objects, each with `body`.
  type?: string;
  age?: number;
  url?: string;
  body?: Record<string, unknown>;
};

export function cspReportRouter(): Hono {
  const r = new Hono();

  r.post(
    "/csp-report",
    rateLimit([
      // 60 reports / IP / minute is enough for a chatty page-load
      // without giving an attacker a useful flood vector.
      { bucket: "csp_report_minute", windowMs: 60_000, max: 60 },
    ]),
    async (c) => {
      // Defensive parse -- malformed JSON should NOT 500; we 204 so
      // the browser's reporting pipeline doesn't retry.
      const raw = await c.req.text().catch(() => "");
      if (!raw) {
        return c.body(null, 204);
      }

      let parsed: CspReportPayload | CspReportPayload[] | null = null;
      try {
        parsed = JSON.parse(raw) as CspReportPayload | CspReportPayload[];
      } catch {
        logger.warn(
          { component: "csp", bodyPreview: raw.slice(0, 200) },
          "CSP violation report: malformed JSON body"
        );
        return c.body(null, 204);
      }

      // Normalise: array (Reports API) and object (legacy) both
      // serialised into a flat list of report bodies.
      const reports = Array.isArray(parsed) ? parsed : [parsed];

      for (const r of reports) {
        const legacy = r["csp-report"];
        const modern = r.body as CspReportPayload["csp-report"] | undefined;
        const report = legacy ?? modern;
        if (!report) continue;

        // SAFETY: `script-sample` is logged deliberately — it carries
        // the prefix of the offending script that the browser would
        // have executed had the CSP allowed it. That's the
        // load-bearing evidence for an XSS post-mortem. It is also
        // attacker-controlled content. If the operator ever ships
        // these reports onward (alerting, dashboards), the sink must
        // treat the field as untrusted user input and render it as
        // text -- never interpolate into HTML, never eval, never
        // execute. Browsers cap the field at 40 chars so the surface
        // is small.
        logger.warn(
          {
            component: "csp",
            documentUri: report["document-uri"],
            violatedDirective: report["violated-directive"] ?? report["effective-directive"],
            blockedUri: report["blocked-uri"],
            sourceFile: report["source-file"],
            lineNumber: report["line-number"],
            scriptSample: report["script-sample"],
            disposition: report.disposition,
          },
          "CSP violation report"
        );
      }

      return c.body(null, 204);
    }
  );

  return r;
}
