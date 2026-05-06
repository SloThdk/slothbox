#!/usr/bin/env node
// Drop all SlothBox-owned tables. LOCAL DEVELOPMENT ONLY.
// Refuses to run if NODE_ENV=production.

import postgres from "postgres";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset database in production.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const tables = [
  "rate_limits",
  "audit_chain",
  "share_chunks",
  "shares",
  "_migrations",
];

try {
  for (const t of tables) {
    await sql.unsafe(`DROP TABLE IF EXISTS ${t} CASCADE`);
    console.log(`dropped ${t}`);
  }
  console.log("done.");
} finally {
  await sql.end();
}
