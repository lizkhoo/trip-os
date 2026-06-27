/**
 * Shared migration applier for Node-side tooling (smoke test + e2e harness).
 *
 * Reads every src/db/migrations/*.sql file in lexical order, splits each on the
 * drizzle "--> statement-breakpoint" marker, and executes the statements against
 * a better-sqlite3 database. Kept in one place so the smoke test and the e2e
 * harness can't drift on how migrations are applied.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type Database from 'better-sqlite3';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'src/db/migrations');

export function applyMigrations(db: Database.Database): void {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      db.exec(stmt);
    }
  }
}
