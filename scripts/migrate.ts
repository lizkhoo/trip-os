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

/**
 * Apply a contiguous slice of migrations instead of all of them. Both bounds are
 * inclusive filename prefixes ('0001'). Lets a test stand the schema up as it
 * was before a given migration, seed real rows, then apply just that migration —
 * which is the only way to catch a migration that loses data, since a fresh
 * database has nothing to lose.
 */
export interface ApplyMigrationsOptions {
  from?: string;
  through?: string;
}

function indexOfPrefix(files: string[], prefix: string): number {
  const i = files.findIndex((f) => f.startsWith(prefix));
  if (i === -1) throw new Error(`applyMigrations: no migration matching '${prefix}'`);
  return i;
}

export function applyMigrations(
  db: Database.Database,
  options: ApplyMigrationsOptions = {},
): void {
  const all = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const start = options.from === undefined ? 0 : indexOfPrefix(all, options.from);
  const end =
    options.through === undefined ? all.length - 1 : indexOfPrefix(all, options.through);
  const files = all.slice(start, end + 1);

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
