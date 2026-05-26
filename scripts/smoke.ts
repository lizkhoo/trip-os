/**
 * Node-side smoke test for the Foundation slice.
 *
 * What it proves on Linux (no Xcode):
 *  - Drizzle migrations apply cleanly to a fresh SQLite database.
 *  - The seed transform produces ≥ 1 reservation per type with valid Zod-parsed shapes.
 *  - Dedup keys match for two identical proposed reservations.
 *
 * What it does NOT prove: the actual app boots, expo-sqlite works, or any UI renders.
 * Those need a Mac. See README's "Verification on macOS" section.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { runSeedWithDeps } from './seed';
import { ReservationInputSchema, type ReservationInput } from '@/domain/reservation';
import { computeDedupKey, keysMatch } from '@/services/dedup';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'src/db/migrations');

function applyMigrations(db: Database.Database): void {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      db.exec(stmt);
    }
  }
}

function buildDeps(db: Database.Database) {
  const insertTrip = db.prepare(
    `INSERT INTO trips (id, title, start_date, end_date, home_timezone) VALUES (?, ?, ?, ?, ?)`,
  );
  const findTrip = db.prepare(`SELECT id FROM trips WHERE title = ?`);
  const deleteTripStmt = db.prepare(`DELETE FROM trips WHERE id = ?`);
  const insertLocation = db.prepare(
    `INSERT INTO locations (id, name, geocode_query, timezone) VALUES (?, ?, ?, ?)`,
  );
  const findLocation = db.prepare(`SELECT id FROM locations WHERE geocode_query = ?`);
  const insertReservation = db.prepare(
    `INSERT INTO reservations (
      id, trip_id, type, title, start_at, end_at, start_location_id, end_location_id,
      confirmation_code, source, source_ref, confidence, status, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    createTrip: async (i: {
      title: string;
      start_date: string;
      end_date: string;
      home_timezone: string;
    }) => {
      const id = uuidv4();
      insertTrip.run(id, i.title, i.start_date, i.end_date, i.home_timezone);
      return { id };
    },
    findTripByTitle: async (title: string) => {
      const row = findTrip.get(title) as { id: string } | undefined;
      return row;
    },
    deleteTrip: async (id: string) => {
      deleteTripStmt.run(id);
    },
    findOrCreateLocation: async (i: { name: string; geocode_query: string; timezone: string }) => {
      const row = findLocation.get(i.geocode_query) as { id: string } | undefined;
      if (row) return row;
      const id = uuidv4();
      insertLocation.run(id, i.name, i.geocode_query, i.timezone);
      return { id };
    },
    createReservation: async (i: ReservationInput) => {
      const id = uuidv4();
      insertReservation.run(
        id,
        i.trip_id,
        i.type,
        i.title,
        i.start_at,
        i.end_at ?? null,
        i.start_location_id ?? null,
        i.end_location_id ?? null,
        i.confirmation_code ?? null,
        i.source,
        i.source_ref ?? null,
        i.confidence ?? null,
        i.status ?? 'confirmed',
        JSON.stringify(i.details),
      );
      return { id };
    },
  };
}

function assertPositive(condition: boolean, msg: string): void {
  if (!condition) {
    console.error('✗', msg);
    process.exit(1);
  }
  console.log('✓', msg);
}

async function main() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  console.log('✓ migrations applied');

  const settings = db.prepare(`SELECT id FROM settings`).all();
  assertPositive(settings.length === 1, 'settings singleton row exists');
  const sync = db.prepare(`SELECT id FROM gmail_sync_state`).all();
  assertPositive(sync.length === 1, 'gmail_sync_state singleton row exists');

  const summary = await runSeedWithDeps(buildDeps(db));
  console.log(
    `✓ seed produced 1 trip, ${summary.reservations} reservations, ${summary.locations} locations`,
  );
  assertPositive(summary.reservations > 0, 'seed produced reservations');

  const rows = db
    .prepare(
      `SELECT trip_id, type, title, start_at, end_at, start_location_id, end_location_id,
              confirmation_code, source, source_ref, confidence, status, details, manually_edited_at
       FROM reservations`,
    )
    .all() as Array<Record<string, unknown>>;

  const seenTypes = new Set<string>();
  for (const row of rows) {
    seenTypes.add(row.type as string);
    const candidate = {
      trip_id: row.trip_id,
      type: row.type,
      title: row.title,
      start_at: row.start_at,
      end_at: row.end_at,
      start_location_id: row.start_location_id,
      end_location_id: row.end_location_id,
      confirmation_code: row.confirmation_code,
      source: row.source,
      source_ref: row.source_ref,
      confidence: row.confidence,
      status: row.status,
      details: JSON.parse(row.details as string),
    };
    const parsed = ReservationInputSchema.safeParse(candidate);
    if (!parsed.success) {
      console.error('✗ reservation failed schema:', candidate, parsed.error.flatten());
      process.exit(1);
    }
  }
  for (const t of ['flight', 'lodging', 'dining', 'activity', 'transit'] as const) {
    assertPositive(seenTypes.has(t), `seed includes at least one ${t}`);
  }
  console.log(`✓ all ${rows.length} seeded reservations pass ReservationInputSchema`);

  // Dedup smoke: two identical inputs produce matching keys.
  const a: ReservationInput = {
    trip_id: uuidv4(),
    type: 'flight',
    title: 'AS 338 RDM → SEA',
    start_at: '2026-03-14T09:02:00-07:00',
    source: 'manual',
    status: 'confirmed',
    details: {
      carrier: 'AS',
      flight_number: '338',
      depart_iata: 'RDM',
      arrive_iata: 'SEA',
      iana_timezone: 'America/Los_Angeles',
    },
  } as ReservationInput;
  const b: ReservationInput = JSON.parse(JSON.stringify(a));
  const ka = computeDedupKey(a);
  const kb = computeDedupKey(b);
  assertPositive(keysMatch(ka, kb), 'dedup keys match for identical flights');

  // Different flight number → must NOT match.
  const c: ReservationInput = JSON.parse(JSON.stringify(a));
  (c.details as { flight_number: string }).flight_number = '339';
  const kc = computeDedupKey(c);
  assertPositive(!keysMatch(ka, kc), 'dedup keys differ for different flight numbers');

  console.log('\n✓ smoke test passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
