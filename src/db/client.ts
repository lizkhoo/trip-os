import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const DB_NAME = 'trip-os.db';

const sqliteDb = SQLite.openDatabaseSync(DB_NAME);
sqliteDb.execSync('PRAGMA foreign_keys = ON;');
sqliteDb.execSync('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqliteDb, { schema });
export { schema };
export type Db = typeof db;
