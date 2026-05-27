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

  // Upload-sync smoke: mock AppleVision + Claude extract, run the node-side replica of
  // syncUpload, assert 1 attachment row + 1 candidate row linked by extractionRunId.
  const tripRow = db.prepare(`SELECT id, home_timezone FROM trips LIMIT 1`).get() as
    | { id: string; home_timezone: string }
    | undefined;
  if (!tripRow) {
    console.error('✗ no trip from seed');
    process.exit(1);
  }
  db.prepare(`UPDATE settings SET auto_promote_threshold = 0.9 WHERE id = 'default'`).run();

  await runSyncUploadNodeReplica(db, {
    fakeSourceUri: '/tmp/fake-flight.jpg',
    fakeKind: 'image',
    recognizeText: async () => ({
      text: 'AS 338 RDM SEA 2026-03-14 09:02 PDT',
      blocks: [],
      pageImageUris: ['file:///tmp/fake-flight.jpg'],
    }),
    extractReservationFromAttachment: async ({ source_ref }) => ({
      proposed_reservation: {
        trip_id: tripRow.id,
        type: 'flight',
        title: 'AS 338 RDM → SEA',
        start_at: '2026-03-14T09:02:00-07:00',
        source: 'upload',
        source_ref,
        confidence: 0.95,
        status: 'confirmed',
        details: {
          carrier: 'AS',
          flight_number: '338',
          depart_iata: 'RDM',
          arrive_iata: 'SEA',
          iana_timezone: 'America/Los_Angeles',
        },
      } as ReservationInput,
      confidence: 0.95,
      raw_claude_response: '{"mocked":true}',
    }),
  });

  const attachmentRows = db
    .prepare(`SELECT id, extraction_run_id, ocr_text FROM attachments`)
    .all() as Array<{ id: string; extraction_run_id: string; ocr_text: string | null }>;
  const uploadCandidates = db
    .prepare(`SELECT id, source, source_ref, status FROM extraction_candidates WHERE source = 'upload'`)
    .all() as Array<{ id: string; source: string; source_ref: string; status: string }>;

  assertPositive(attachmentRows.length === 1, 'upload created 1 attachment row');
  assertPositive(uploadCandidates.length === 1, 'upload created 1 candidate row');
  const att = attachmentRows[0];
  const cand = uploadCandidates[0];
  assertPositive(
    !!att && !!cand && att.extraction_run_id === cand.source_ref,
    'attachment.extractionRunId === candidate.source_ref (acceptCandidate re-attach contract)',
  );
  assertPositive(!!att?.ocr_text, 'attachment.ocr_text populated from AppleVision mock');

  console.log('\n✓ smoke test passed');
}

// Node-side replica of syncUpload.importFile. Mirrors the orchestrator's logic but uses
// better-sqlite3 prepared statements directly so it works without expo-sqlite / expo-file-system /
// the real AppleVision native module. If you change importFile's logic, keep this in sync.
interface UploadReplicaDeps {
  fakeSourceUri: string;
  fakeKind: 'image' | 'pdf';
  recognizeText: (
    uri: string,
  ) => Promise<{ text: string; blocks: Array<unknown>; pageImageUris: string[] }>;
  extractReservationFromAttachment: (args: {
    ocr_text: string;
    image_uris: string[];
    source_ref: string;
  }) => Promise<{
    proposed_reservation: ReservationInput;
    confidence: number;
    raw_claude_response: string;
  }>;
}

async function runSyncUploadNodeReplica(db: Database.Database, deps: UploadReplicaDeps): Promise<void> {
  const extractionRunId = uuidv4();
  const attachmentId = uuidv4();
  // Stand-in for storage.put — the real one copies under FileSystem.documentDirectory.
  const fakeStorageUri = `file:///fake-uploads/${attachmentId}.${deps.fakeKind === 'pdf' ? 'pdf' : 'jpg'}`;

  db.prepare(
    `INSERT INTO attachments (id, kind, storage_uri, extraction_run_id) VALUES (?, ?, ?, ?)`,
  ).run(attachmentId, deps.fakeKind, fakeStorageUri, extractionRunId);

  const ocr = await deps.recognizeText(fakeStorageUri);
  db.prepare(`UPDATE attachments SET ocr_text = ? WHERE id = ?`).run(ocr.text, attachmentId);

  const extraction = await deps.extractReservationFromAttachment({
    ocr_text: ocr.text,
    image_uris: ocr.pageImageUris.length > 0 ? ocr.pageImageUris : [fakeStorageUri],
    source_ref: extractionRunId,
  });

  const proposed: ReservationInput = {
    ...extraction.proposed_reservation,
    source: 'upload',
    source_ref: extractionRunId,
    confidence: extraction.confidence,
  } as ReservationInput;

  const trips = db
    .prepare(`SELECT id, start_date, end_date, home_timezone FROM trips`)
    .all() as Array<{ id: string; start_date: string; end_date: string; home_timezone: string }>;
  const start = proposed.start_at;
  const day = new Date(start).toISOString().slice(0, 10);
  const matching = trips.filter((t) => day >= t.start_date && day <= t.end_date);
  const tripId = matching.length === 1 ? (matching[0]?.id ?? null) : null;
  const finalProposed = tripId ? ({ ...proposed, trip_id: tripId } as ReservationInput) : proposed;

  db.prepare(
    `INSERT INTO extraction_candidates (id, trip_id, source, source_ref, raw_text, claude_response, proposed_reservation, confidence, status)
     VALUES (?, ?, 'upload', ?, ?, ?, ?, ?, 'pending')`,
  ).run(
    uuidv4(),
    tripId,
    extractionRunId,
    ocr.text,
    extraction.raw_claude_response,
    JSON.stringify(finalProposed),
    extraction.confidence,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
