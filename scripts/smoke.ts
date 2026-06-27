/**
 * Node-side smoke test for the Foundation slice.
 *
 * What it proves on Linux (no Xcode):
 *  - Drizzle migrations apply cleanly to a fresh SQLite database.
 *  - The seed transform produces ≥ 1 reservation per type with valid Zod-parsed shapes.
 *  - Dedup keys match for two identical proposed reservations.
 *  - The REAL `runGmailSync` orchestrator runs in Node via the DB port: two mock
 *    messages → two candidates, one auto-promoted above threshold.
 *
 * What it does NOT prove: the actual app boots, expo-sqlite works, or any UI renders.
 * Those need a Mac. See README's "Verification on macOS" section.
 */
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { runSeedWithDeps } from './seed';
import {
  ReservationInputSchema,
  type ReservationInput,
  type ReservationProposal,
} from '@/domain/reservation';
import { computeDedupKey, keysMatch } from '@/services/dedup';
import { runGmailSync } from '@/services/syncGmail';
import {
  createHarness,
  installMockExtract,
  installMockGmail,
} from '../tests/e2e/harness';
import type { ExtractionResult } from '@/services/extract';

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
  // The harness builds the same fresh in-memory better-sqlite3 + migrations as
  // before, and injects the drizzle client into the DB port so the REAL services
  // (runGmailSync below) run against this exact database. `harness.raw` is the
  // underlying handle, used for the direct-SQL seed + shape assertions.
  const harness = createHarness();
  const db = harness.raw;
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

  // Gmail-sync smoke: two mock messages, one high-confidence and one low, both
  // landing inside the seeded Japan trip's range so trip auto-assignment fires.
  // Drives the REAL runGmailSync through the DB port (no replica).
  // Asserts: 2 candidates created; 1 auto-promoted when confidence ≥ threshold.
  const tripCount = (db.prepare(`SELECT COUNT(*) AS n FROM trips`).get() as { n: number }).n;
  if (tripCount === 0) {
    console.error('✗ no trip from seed');
    process.exit(1);
  }
  db.prepare(`UPDATE settings SET auto_promote_threshold = 0.9 WHERE id = 'default'`).run();

  // A flight that is NOT already in the seed (the seed contains AS 338), landing
  // inside the trip range so it auto-assigns and — being unique — auto-promotes.
  const flightProposal: ReservationProposal = {
    type: 'flight',
    title: 'NH 110 HND → ITM',
    start_at: '2026-03-20T09:00:00+09:00',
    source: 'gmail',
    source_ref: 'msg-flight-hi',
    confidence: 0.95,
    status: 'confirmed',
    details: {
      carrier: 'NH',
      flight_number: '110',
      depart_iata: 'HND',
      arrive_iata: 'ITM',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;

  const diningProposal: ReservationProposal = {
    type: 'dining',
    title: 'Sushi Saito',
    start_at: '2026-03-21T19:00:00+09:00',
    source: 'gmail',
    source_ref: 'msg-dining-lo',
    confidence: 0.6,
    status: 'confirmed',
    details: {
      party_size: 2,
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;

  installMockGmail([
    {
      id: 'msg-flight-hi',
      subject: 'Your Alaska Air flight confirmation',
      bodyText: 'AS 338 RDM to SEA on 2026-03-14 at 09:02 PDT',
    },
    {
      id: 'msg-dining-lo',
      subject: 'OpenTable reservation',
      bodyText: 'Sushi Saito, Tokyo, party of 2',
    },
  ]);

  installMockExtract(
    new Map<string, ExtractionResult>([
      [
        'msg-flight-hi',
        {
          ok: true,
          proposed_reservation: flightProposal,
          confidence: 0.95,
          raw_claude_response: '{"mocked":true}',
        },
      ],
      [
        'msg-dining-lo',
        {
          ok: true,
          proposed_reservation: diningProposal,
          confidence: 0.6,
          raw_claude_response: '{"mocked":true}',
        },
      ],
    ]),
  );

  const result = await runGmailSync();
  assertPositive(result.candidatesCreated === 2, 'sync created 2 candidates');
  assertPositive(result.promoted === 1, 'one candidate auto-promoted (confidence ≥ 0.9)');

  const candRows = db
    .prepare(`SELECT status, confidence FROM extraction_candidates`)
    .all() as Array<{ status: string; confidence: number }>;
  assertPositive(candRows.length === 2, 'two candidate rows persisted');
  const promoted = candRows.filter((r) => r.status === 'accepted').length;
  const pending = candRows.filter((r) => r.status === 'pending').length;
  assertPositive(promoted === 1, 'one candidate row marked accepted');
  assertPositive(pending === 1, 'one candidate row left pending (below threshold)');

  harness.teardown();
  console.log('\n✓ smoke test passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
