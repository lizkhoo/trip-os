/**
 * Migration 0002 safety — widening the source CHECK must not drop data.
 *
 * 0002 rebuilds `reservations` and `extraction_candidates` (SQLite can't alter a
 * CHECK constraint in place). drizzle's migrator runs migrations inside a
 * transaction, where `PRAGMA foreign_keys=OFF` is a no-op, so the DROP TABLE on
 * `reservations` performs an implicit DELETE that fires ON DELETE SET NULL on
 * everything referencing it. 0002 is hand-written to snapshot and restore those
 * references, and to recreate the updated_at triggers the rebuild destroys.
 *
 * This test is the reason that hand-editing is defensible: it seeds a database
 * at the pre-0002 schema with linked rows, applies 0002 with foreign_keys ON
 * (as the app does — src/db/client.ts), and asserts nothing was lost.
 *
 * Deliberately builds its own database instead of using `harness` — the harness
 * applies every migration to an empty database, which exercises none of this.
 */
import Database from 'better-sqlite3';
import { applyMigrations } from '../../scripts/migrate';
import type { E2eTest } from './runner';

export const name = 'Migration 0002 — widening source CHECK preserves data + triggers';

interface CountRow {
  n: number;
}
interface LinkRow {
  id: string;
  reservation_id: string | null;
}
interface MergeRow {
  id: string;
  merged_into_reservation_id: string | null;
}
interface UpdatedAtRow {
  updated_at: string;
}
interface NameRow {
  name: string;
}

export const test: E2eTest = async ({ assert, assertEqual }) => {
  const db = new Database(':memory:');
  // Exactly how the app opens it. This is what makes DROP TABLE dangerous.
  db.pragma('foreign_keys = ON');

  // --- Seed at the pre-0002 schema ------------------------------------------
  applyMigrations(db, { through: '0001' });

  db.exec(`
    INSERT INTO trips (id, title, start_date, end_date, home_timezone)
    VALUES ('trip-1', 'Japan 2026', '2026-03-14', '2026-03-21', 'Asia/Tokyo');

    INSERT INTO reservations (id, trip_id, type, title, start_at, source, source_ref, confidence, details, updated_at)
    VALUES
      ('res-1', 'trip-1', 'lodging', 'Park Hotel Tokyo', '2026-03-15T15:00:00+09:00', 'gmail', 'msg-1', 0.96, '{"iana_timezone":"Asia/Tokyo"}', '2020-01-01T00:00:00.000Z'),
      ('res-2', 'trip-1', 'flight', 'AS 338 RDM SEA', '2026-03-14T09:02:00+09:00', 'upload', 'run-1', 0.91, '{"iana_timezone":"Asia/Tokyo"}', '2020-01-01T00:00:00.000Z');

    INSERT INTO attachments (id, reservation_id, kind, storage_uri, ocr_text, extraction_run_id, updated_at)
    VALUES
      ('att-1', 'res-2', 'image', 'file:///uploads/a.jpg', 'OCR TEXT', 'run-1', '2020-01-01T00:00:00.000Z'),
      ('att-2', NULL,    'pdf',   'file:///uploads/b.pdf', 'MORE OCR', 'run-2', '2020-01-01T00:00:00.000Z');

    INSERT INTO extraction_candidates (id, trip_id, source, source_ref, raw_text, proposed_reservation, confidence, status, merged_into_reservation_id, updated_at)
    VALUES
      ('cand-1', 'trip-1', 'gmail',  'msg-1', 'raw email',  '{"type":"lodging"}', 0.96, 'accepted',    NULL,    '2020-01-01T00:00:00.000Z'),
      ('cand-2', 'trip-1', 'upload', 'run-2', 'raw ocr',    '{"type":"flight"}',  0.55, 'merged_into', 'res-2', '2020-01-01T00:00:00.000Z');
  `);

  // Sanity: the pre-0002 CHECK genuinely rejects 'paste' (otherwise this
  // migration — and this test — would be testing nothing).
  let preRejected = false;
  try {
    db.exec(
      `INSERT INTO reservations (id, trip_id, type, title, start_at, source, details) VALUES ('res-x','trip-1','dining','x','2026-03-16T19:00:00+09:00','paste','{}')`,
    );
  } catch {
    preRejected = true;
  }
  assert(preRejected, "pre-0002 schema rejects source='paste'");

  // --- Apply 0002 ------------------------------------------------------------
  applyMigrations(db, { from: '0002', through: '0002' });

  // --- Rows survived ---------------------------------------------------------
  const resCount = db.prepare('SELECT COUNT(*) AS n FROM reservations').get() as CountRow;
  assertEqual(resCount.n, 2, 'both reservations survived the rebuild');

  const candCount = db.prepare('SELECT COUNT(*) AS n FROM extraction_candidates').get() as CountRow;
  assertEqual(candCount.n, 2, 'both candidates survived the rebuild');

  const attCount = db.prepare('SELECT COUNT(*) AS n FROM attachments').get() as CountRow;
  assertEqual(attCount.n, 2, 'both attachments survived');

  // --- THE regression: FK links were not nulled by the implicit DELETE -------
  const att1 = db
    .prepare('SELECT id, reservation_id FROM attachments WHERE id = ?')
    .get('att-1') as LinkRow;
  assertEqual(att1.reservation_id, 'res-2', 'attachments.reservation_id survived (att-1 → res-2)');

  const att2 = db
    .prepare('SELECT id, reservation_id FROM attachments WHERE id = ?')
    .get('att-2') as LinkRow;
  assertEqual(att2.reservation_id, null, 'an unlinked attachment stays unlinked (att-2)');

  const cand2 = db
    .prepare('SELECT id, merged_into_reservation_id FROM extraction_candidates WHERE id = ?')
    .get('cand-2') as MergeRow;
  assertEqual(
    cand2.merged_into_reservation_id,
    'res-2',
    'extraction_candidates.merged_into_reservation_id survived (cand-2 → res-2)',
  );

  // Restoring the links must not have bumped unrelated updated_at stamps.
  const att1Updated = db
    .prepare('SELECT updated_at FROM attachments WHERE id = ?')
    .get('att-1') as UpdatedAtRow;
  assertEqual(
    att1Updated.updated_at,
    '2020-01-01T00:00:00.000Z',
    'restoring links did not bump attachments.updated_at',
  );

  // --- The widened CHECK actually took ---------------------------------------
  let postAccepted = true;
  try {
    db.exec(
      `INSERT INTO reservations (id, trip_id, type, title, start_at, source, details) VALUES ('res-3','trip-1','dining','Maisen','2026-03-18T19:30:00+09:00','paste','{}')`,
    );
  } catch {
    postAccepted = false;
  }
  assert(postAccepted, "post-0002 schema accepts source='paste' on reservations");

  let candPasteAccepted = true;
  try {
    db.exec(
      `INSERT INTO extraction_candidates (id, source, proposed_reservation) VALUES ('cand-3','paste','{"type":"dining"}')`,
    );
  } catch {
    candPasteAccepted = false;
  }
  assert(candPasteAccepted, "post-0002 schema accepts source='paste' on extraction_candidates");

  // …and still rejects garbage.
  let garbageRejected = false;
  try {
    db.exec(
      `INSERT INTO reservations (id, trip_id, type, title, start_at, source, details) VALUES ('res-4','trip-1','dining','x','2026-03-19T19:30:00+09:00','telepathy','{}')`,
    );
  } catch {
    garbageRejected = true;
  }
  assert(garbageRejected, 'post-0002 schema still rejects an unknown source');

  // --- Triggers the rebuild dropped were recreated ---------------------------
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all() as NameRow[];
  const names = new Set(triggers.map((t) => t.name));
  for (const t of [
    'reservations_updated_at',
    'extraction_candidates_updated_at',
    'attachments_updated_at',
  ]) {
    assert(names.has(t), `trigger ${t} exists after the rebuild`);
  }

  // And they actually fire — a trigger row in sqlite_master that doesn't work
  // would pass the check above.
  db.exec(`UPDATE reservations SET title = 'Park Hotel Tokyo (renamed)' WHERE id = 'res-1'`);
  const res1 = db
    .prepare('SELECT updated_at FROM reservations WHERE id = ?')
    .get('res-1') as UpdatedAtRow;
  assert(
    res1.updated_at !== '2020-01-01T00:00:00.000Z',
    'reservations_updated_at trigger bumps updated_at on update',
  );

  // --- No rebuild scaffolding left behind ------------------------------------
  const leftovers = db
    .prepare("SELECT name FROM sqlite_master WHERE name LIKE '__new_%' OR name LIKE '_mig0002_%'")
    .all() as NameRow[];
  assertEqual(leftovers.length, 0, 'no __new_ / _mig0002_ scaffolding tables left behind');

  // --- Integrity ------------------------------------------------------------
  const fkErrors = db.pragma('foreign_key_check') as unknown[];
  assertEqual(fkErrors.length, 0, 'foreign_key_check reports no violations after the migration');

  db.close();
};
