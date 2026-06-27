import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

const DB_NAME = 'trip-os.db';

/**
 * The active drizzle client. There are two backends with an identical
 * query-builder surface: expo-sqlite (the app) and better-sqlite3 (Node
 * tests). We never construct the expo-sqlite client at import time — that pins
 * a native module that can't load in Node — so the app builds it lazily on
 * first `getDb()` call, and tests inject a better-sqlite3-backed client via
 * `__setDbForTest`.
 *
 * `Db` is the drizzle base SQLite database type specialised to our schema. Both
 * the expo-sqlite client (sync result type) and the better-sqlite3 client are
 * assignable to it, so services keep the full query-builder API regardless of
 * which backend is active.
 */
export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

let activeDb: Db | null = null;
let testDb: Db | null = null;

function buildExpoDb(): Db {
  // Deferred requires so importing this module never touches expo-sqlite. This
  // path only runs inside the app; `require` (not `await import`) keeps getDb()
  // synchronous for the services that call it.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const { drizzle } = require('drizzle-orm/expo-sqlite') as typeof import('drizzle-orm/expo-sqlite');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const sqliteDb = SQLite.openDatabaseSync(DB_NAME);
  sqliteDb.execSync('PRAGMA foreign_keys = ON;');
  sqliteDb.execSync('PRAGMA journal_mode = WAL;');
  return drizzle(sqliteDb, { schema }) as unknown as Db;
}

/**
 * Return the active drizzle client. Tests' injected client wins; otherwise the
 * expo-sqlite client is constructed lazily on first use and cached.
 */
export function getDb(): Db {
  if (testDb) return testDb;
  if (!activeDb) activeDb = buildExpoDb();
  return activeDb;
}

/**
 * Inject a drizzle client for tests (e.g. a better-sqlite3-backed one), or pass
 * `null` to clear the override and fall back to the real lazy client.
 */
export function __setDbForTest(db: Db | null): void {
  testDb = db;
}

export { schema };
