#!/usr/bin/env node
// Idempotent migration runner — applies db/migrations/*.sql in order.
// Tracks applied migrations in a `_migrations` table.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "db", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function appliedMigrations() {
  const rows = await sql`SELECT name FROM _migrations ORDER BY name`;
  return new Set(rows.map((r) => r.name));
}

async function run() {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }

    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`→ applying ${file}`);

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(sqlText);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
      console.log(`✓ ${file}`);
    } catch (err) {
      console.error(`✗ ${file} failed:`, err);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log("done.");
}

run().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
