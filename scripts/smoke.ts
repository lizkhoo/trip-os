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
import {
  ReservationInputSchema,
  type Reservation,
  type ReservationInput,
} from '@/domain/reservation';
import { computeDedupKey, keysMatch } from '@/services/dedup';
import type { Location } from '@/domain/location';
import {
  buildItineraryDays,
  getCityGroups,
  getTransitPairs,
  nightOfM,
  appleMapsDirectionsUrl,
} from '@/lib/itinerary';

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

  // Itinerary helpers smoke: city grouping + transit pairs + night-of-M.
  const tripId = uuidv4();
  const locTokyo: Location = {
    id: uuidv4(),
    name: 'OMO5 Tokyo Otsuka',
    address: null,
    lat: null,
    lng: null,
    geocode_query: 'OMO5 Tokyo Otsuka, Tokyo, Japan',
    place_id: null,
    timezone: 'Asia/Tokyo',
  };
  const locOsaka: Location = {
    id: uuidv4(),
    name: 'Hotel Granvia Osaka',
    address: null,
    lat: null,
    lng: null,
    geocode_query: 'Hotel Granvia Osaka, Osaka, Japan',
    place_id: null,
    timezone: 'Asia/Tokyo',
  };
  const locMap = new Map<string, Location>([
    [locTokyo.id, locTokyo],
    [locOsaka.id, locOsaka],
  ]);
  const lodging1: Reservation = {
    id: uuidv4(),
    trip_id: tripId,
    type: 'lodging',
    title: 'OMO5 Tokyo',
    start_at: '2026-03-14T15:00:00+09:00',
    end_at: '2026-03-17T11:00:00+09:00',
    start_location_id: locTokyo.id,
    end_location_id: locTokyo.id,
    confirmation_code: null,
    source: 'manual',
    source_ref: null,
    confidence: null,
    status: 'confirmed',
    details: { property_name: 'OMO5 Tokyo Otsuka', nights: 3, iana_timezone: 'Asia/Tokyo' },
    manually_edited_at: null,
  };
  const lodging2: Reservation = {
    ...lodging1,
    id: uuidv4(),
    title: 'Hotel Granvia Osaka',
    start_at: '2026-03-17T15:00:00+09:00',
    end_at: '2026-03-19T11:00:00+09:00',
    start_location_id: locOsaka.id,
    end_location_id: locOsaka.id,
    details: { property_name: 'Hotel Granvia Osaka', nights: 2, iana_timezone: 'Asia/Tokyo' },
  };
  const days = buildItineraryDays(
    '2026-03-14',
    '2026-03-18',
    [lodging1, lodging2],
    'Asia/Tokyo',
    locMap,
  );
  assertPositive(days.length === 5, 'enumerated 5 days');
  const groups = getCityGroups(days);
  assertPositive(
    groups.length === 2 && groups[0]?.city === 'Tokyo' && groups[1]?.city === 'Osaka',
    'city groups split Tokyo → Osaka',
  );

  const nightOn15 = nightOfM(lodging1, '2026-03-15', 'Asia/Tokyo');
  assertPositive(nightOn15?.n === 2 && nightOn15?.m === 3, 'night 2 of 3 on 2026-03-15');
  const nightOn17 = nightOfM(lodging1, '2026-03-17', 'Asia/Tokyo');
  assertPositive(nightOn17 === null, 'checkout day is not a night for OMO5');

  const transitDay = days.find((d) => d.date === '2026-03-17');
  if (!transitDay) {
    console.error('✗ expected a day 2026-03-17');
    process.exit(1);
  }
  const pairs = getTransitPairs(
    transitDay.reservations,
    locMap,
    { name: locTokyo.name, query: locTokyo.geocode_query },
  );
  assertPositive(
    pairs.length >= 1 && pairs[0]?.toQuery === locOsaka.geocode_query,
    'transit pair Tokyo → Osaka emitted on changeover day',
  );

  const mapsUrl = appleMapsDirectionsUrl(locTokyo.geocode_query, locOsaka.geocode_query);
  assertPositive(mapsUrl.startsWith('maps://?saddr='), 'apple maps directions URL well-formed');

  console.log('\n✓ smoke test passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
