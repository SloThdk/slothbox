// Health probe used by docker-compose's `healthcheck:` block. Must respond
// 200 quickly and without taking any external dependency. The shape is
// stable JSON so future probes (Caddy, uptime monitors, Grafana checks) can
// parse it consistently.

import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/config";

// Health checks must be free of caching layers — `force-dynamic` plus the
// `Cache-Control: no-store` header guarantees that.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "web",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
