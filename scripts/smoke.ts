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
  type ReservationInput,
  type ReservationProposal,
} from '@/domain/reservation';
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

  // Gmail-sync smoke: two mock messages, one high-confidence and one low, both
  // landing inside the seeded Japan trip's range so trip auto-assignment fires.
  // Asserts: 2 candidates created; 1 auto-promoted when confidence ≥ threshold.
  const tripCount = (db.prepare(`SELECT COUNT(*) AS n FROM trips`).get() as { n: number }).n;
  if (tripCount === 0) {
    console.error('✗ no trip from seed');
    process.exit(1);
  }
  db.prepare(`UPDATE settings SET auto_promote_threshold = 0.9 WHERE id = 'default'`).run();

  const mockMessages = new Map<string, { subject: string; body: string }>([
    [
      'msg-flight-hi',
      {
        subject: 'Your Alaska Air flight confirmation',
        body: 'AS 338 RDM to SEA on 2026-03-14 at 09:02 PDT',
      },
    ],
    [
      'msg-dining-lo',
      {
        subject: 'OpenTable reservation',
        body: 'Sushi Saito, Tokyo, party of 2',
      },
    ],
  ]);

  // Proposals carry no trip_id — that lives on the candidate row (auto-assigned)
  // or is supplied by the user at accept time.
  const mockExtractions = new Map<string, { confidence: number; reservation: ReservationProposal }>([
    [
      'msg-flight-hi',
      {
        confidence: 0.95,
        reservation: {
          type: 'flight',
          title: 'AS 338 RDM → SEA',
          start_at: '2026-03-14T09:02:00-07:00',
          source: 'gmail',
          source_ref: 'msg-flight-hi',
          confidence: 0.95,
          status: 'confirmed',
          details: {
            carrier: 'AS',
            flight_number: '338',
            depart_iata: 'RDM',
            arrive_iata: 'SEA',
            iana_timezone: 'America/Los_Angeles',
          },
        } as ReservationProposal,
      },
    ],
    [
      'msg-dining-lo',
      {
        confidence: 0.6,
        reservation: {
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
        } as ReservationProposal,
      },
    ],
  ]);

  // Run a node-side replica of runGmailSync that drives the same logic against
  // better-sqlite3. The production module imports expo-sqlite, so we test the
  // orchestration contract here rather than the exact module.
  await runGmailSyncNodeReplica(db, {
    searchMessageIds: async () => [...mockMessages.keys()],
    fetchMessage: async (id) => {
      const m = mockMessages.get(id);
      if (!m) throw new Error(`unknown mock message ${id}`);
      return {
        id,
        subject: m.subject,
        from: 'noreply@example.com',
        bodyText: m.body,
        date: '2026-03-01',
        snippet: m.subject,
      };
    },
    extractReservationFromEmail: async ({ message_id }) => {
      const m = mockExtractions.get(message_id);
      if (!m) throw new Error(`unknown mock extraction ${message_id}`);
      return {
        proposed_reservation: m.reservation,
        confidence: m.confidence,
        raw_claude_response: '{"mocked":true}',
      };
    },
  });

  const candRows = db
    .prepare(`SELECT status, confidence FROM extraction_candidates`)
    .all() as Array<{ status: string; confidence: number }>;
  assertPositive(candRows.length === 2, 'sync created 2 candidates');
  const promoted = candRows.filter((r) => r.status === 'accepted').length;
  const pending = candRows.filter((r) => r.status === 'pending').length;
  assertPositive(promoted === 1, 'one candidate auto-promoted (confidence ≥ 0.9)');
  assertPositive(pending === 1, 'one candidate left pending (confidence below threshold)');

  console.log('\n✓ smoke test passed');
}

// Node-side replica of runGmailSync. Mirrors the orchestrator's logic but uses
// better-sqlite3 prepared statements directly so it works without expo-sqlite.
// TODO: collapse into a thin in-memory-DB version of runGmailSync once we
// abstract the drizzle client behind a small port — currently the production
// module pins expo-sqlite at import time, which we can't bring into Node.
// If you change runGmailSync's logic, keep this in sync.
interface NodeReplicaDeps {
  searchMessageIds: (q: string, after?: string) => Promise<string[]>;
  fetchMessage: (id: string) => Promise<{
    id: string;
    subject: string;
    from: string;
    bodyText: string;
    date: string;
    snippet: string;
  }>;
  extractReservationFromEmail: (args: { raw_text: string; message_id: string }) => Promise<{
    proposed_reservation: ReservationProposal;
    confidence: number;
    raw_claude_response: string;
  }>;
}

async function runGmailSyncNodeReplica(db: Database.Database, deps: NodeReplicaDeps): Promise<void> {
  const settingsRow = db
    .prepare(`SELECT auto_promote_threshold, sender_allowlist, gmail_label_name FROM settings WHERE id = 'default'`)
    .get() as
    | {
        auto_promote_threshold: number;
        sender_allowlist: string;
        gmail_label_name: string;
      }
    | undefined;
  const threshold = settingsRow?.auto_promote_threshold ?? 0.9;
  const trips = db.prepare(`SELECT id, start_date, end_date, home_timezone FROM trips`).all() as Array<{
    id: string;
    start_date: string;
    end_date: string;
    home_timezone: string;
  }>;

  const ids = await deps.searchMessageIds('mock');
  const seen = new Set(
    (db
      .prepare(`SELECT source_ref FROM extraction_candidates WHERE source = 'gmail'`)
      .all() as Array<{ source_ref: string | null }>)
      .map((r) => r.source_ref)
      .filter((r): r is string => !!r),
  );

  const insertCand = db.prepare(
    `INSERT INTO extraction_candidates (id, trip_id, source, source_ref, raw_text, claude_response, proposed_reservation, confidence, status)
     VALUES (?, ?, 'gmail', ?, ?, ?, ?, ?, 'pending')`,
  );
  const insertRes = db.prepare(
    `INSERT INTO reservations (id, trip_id, type, title, start_at, end_at, source, source_ref, confidence, status, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateCandAccepted = db.prepare(
    `UPDATE extraction_candidates SET status = 'accepted', merged_into_reservation_id = ? WHERE id = ?`,
  );

  for (const id of ids) {
    if (seen.has(id)) continue;
    const msg = await deps.fetchMessage(id);
    const text = `Subject: ${msg.subject}\nFrom: ${msg.from}\n\n${msg.bodyText}`;
    const ext = await deps.extractReservationFromEmail({ raw_text: text, message_id: id });

    const start = ext.proposed_reservation.start_at;
    const matching = trips.filter((t) => {
      // Cheap in-zone date extract for the smoke test (we only seed Asia/Tokyo + a US trip).
      const day = new Date(start).toISOString().slice(0, 10);
      return day >= t.start_date && day <= t.end_date;
    });
    const tripId = matching.length === 1 ? (matching[0]?.id ?? null) : null;

    insertCand.run(
      uuidv4(),
      tripId,
      id,
      text,
      ext.raw_claude_response,
      // Stored proposal carries NO trip_id — the candidate row owns that.
      JSON.stringify(ext.proposed_reservation),
      ext.confidence,
    );
  }

  // Auto-promote pass: every pending candidate with confidence ≥ threshold and
  // an assigned trip becomes a real reservation.
  const pending = db
    .prepare(
      `SELECT id, trip_id, proposed_reservation, confidence FROM extraction_candidates WHERE status = 'pending' AND confidence >= ?`,
    )
    .all(threshold) as Array<{
    id: string;
    trip_id: string | null;
    proposed_reservation: string;
    confidence: number;
  }>;
  for (const cand of pending) {
    if (!cand.trip_id) continue;
    const proposed = JSON.parse(cand.proposed_reservation) as ReservationProposal;
    const resId = uuidv4();
    insertRes.run(
      resId,
      cand.trip_id,
      proposed.type,
      proposed.title,
      proposed.start_at,
      proposed.end_at ?? null,
      proposed.source,
      proposed.source_ref ?? null,
      proposed.confidence ?? null,
      proposed.status ?? 'confirmed',
      JSON.stringify(proposed.details),
    );
    updateCandAccepted.run(resId, cand.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
