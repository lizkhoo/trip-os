# Overnight MVP run — progress log

Newest entries at the bottom. Each phase: what was attempted, gate results, what's next.

## P0 — clean base (inline) — DONE
- Branched `overnight-mvp` off `gmail-ingestion`.
- Promoted sole-copy helpers: `src/lib/itinerary 2.ts`→`itinerary.ts`, `timezones 2.ts`→`timezones.ts`,
  `app/(consumer)/index 2.tsx`→`index.tsx`.
- Deleted stale duplicates: `gmail 2.ts`, `syncGmail 2.ts`, `syncGmail.d 2.ts`, `syncGmail.d 3.ts`.
- Bumped email extraction model `claude-opus-4-7`→`claude-opus-4-8` (`src/services/extract.ts`).
- Wrote `docs/overnight/PLAN.md` + this log.
- Gate at P0: not yet run (helpers were untracked; first full gate runs in P1).

## Canonical pathway list + how to run
Run the e2e suite from the repo root: `pnpm test:e2e` (tsx runs `tests/e2e/run.ts`, which
discovers every `tests/e2e/*.e2e.ts`, runs it in a fresh better-sqlite3 harness, and exits
non-zero on any failed assertion).

- [x] **Pathway 1 — Gmail → review → timeline.** `tests/e2e/gmail-to-timeline.e2e.ts`. DONE.
- [x] **Pathway 4 — trip lifecycle + itinerary derivation.** `tests/e2e/trip-lifecycle.e2e.ts`. DONE.
- [x] **Pathway 3 — manual CRUD + edit-guard.** `tests/e2e/manual-crud.e2e.ts`. DONE.
- [x] **Pathway 2 — upload → OCR → extract → review → timeline.** `tests/e2e/upload-to-timeline.e2e.ts`. DONE.
- [x] **Pathway 5 — cross-path dedup (Gmail + Upload → one reservation).** `tests/e2e/cross-path-dedup.e2e.ts`. DONE.

## Phase log
- P1 Foundation: DONE.
  - **DB port (`src/db/client.ts`):** the expo-sqlite client is no longer built at import
    time. New `getDb()` lazily constructs the expo-sqlite-backed drizzle client on first use
    (via deferred `require` so importing the module never loads the native module), and
    `__setDbForTest(db | null)` injects a client for tests. `Db` is now the backend-agnostic
    `BaseSQLiteDatabase<'sync', unknown, typeof schema>` so both the expo-sqlite and
    better-sqlite3 clients satisfy it. The old module-const `db` export was removed; all
    callers (`services/{locations,trips,reservations,candidates,syncGmail}.ts`, `app/_layout.tsx`,
    `app/(admin)/settings/index.tsx`) now call `getDb()`.
  - **Deferred native imports for Node-runnability:** `services/secrets.ts` (expo-secure-store),
    `services/gmail.ts` (expo-constants), and `lib/uuid.ts` (react-native-get-random-values, only
    polyfilled when `crypto.getRandomValues` is missing) are now loaded lazily so the real
    services import cleanly under tsx/Node.
  - **Secrets test hatch:** `__setSecretsForTest` in `services/secrets.ts` so
    `getAnthropicKey`/`getGmailTokens` return fixtures without expo-secure-store.
  - **Shared migrations helper:** `scripts/migrate.ts` (`applyMigrations`) is imported by both the
    harness and `scripts/smoke.ts` (no drift).
  - **e2e harness (`tests/e2e/harness.ts`):** builds an in-memory better-sqlite3 db with
    `foreign_keys` on + all migrations applied, wraps it with `drizzle(..., { schema })` from
    `drizzle-orm/better-sqlite3`, injects via `__setDbForTest`, and provides
    `installMockGmail` / `installMockExtract` (over the existing gmail/extract `ViaHatch`
    overrides) plus secret fixtures and a `teardown` that resets every hatch and closes the db.
  - **Runner:** `tests/e2e/runner.ts` (dependency-free assert/test contract) + `tests/e2e/run.ts`
    (discovers `*.e2e.ts`, runs each in its own harness, smoke-style ✓/✗ output, non-zero exit on
    failure). Added `"test:e2e": "tsx tests/e2e/run.ts"` to `package.json`.
  - **Pathway 1 (`tests/e2e/gmail-to-timeline.e2e.ts`):** seeds a trip, installs 2 mock Gmail
    messages + mock extract (hi-conf flight ≥ threshold, lo-conf dining), drives the REAL
    `runGmailSync()`, asserts 2 candidates created / hi-conf auto-promoted / lo-conf pending, calls
    the REAL `acceptCandidate(pendingId, { trip_id })`, then `buildItineraryDays(...)` and asserts
    both reservations land on the correct days.
  - **smoke.ts:** deleted `runGmailSyncNodeReplica` (TODO resolved). smoke now stands up the
    harness, seeds via raw SQL (shape/dedup assertions unchanged), and drives the REAL
    `runGmailSync` through the DB port. Note: the seed already contains `AS 338 RDM → SEA`, so the
    smoke's Gmail mock uses a distinct in-range flight (`NH 110`) to exercise auto-promotion — the
    real orchestrator correctly *dedups* the original AS 338 (the replica didn't, which was a bug).
  - **Gates (all green, exit 0):** `pnpm typecheck`, `pnpm lint` (0 warnings),
    `pnpm smoke`, `pnpm test:e2e` (14 assertions pass).
- P2 Pathway 4 (trip lifecycle + itinerary derivation): DONE.
  - **`tests/e2e/trip-lifecycle.e2e.ts`** drives the REAL services end to end —
    `createTrip`/`getTrip`/`deleteTrip`, `findOrCreateLocation` (asserts
    idempotency on `geocode_query`), `createReservation`/`listReservationsForTrip`
    — then the REAL derivations `buildItineraryDays`, `getCityGroups`, `nightOfM`,
    `getTransitPairs`.
  - **Trip modeled:** Japan, Asia/Tokyo, 2026-03-14..03-19 (6 days inclusive),
    Tokyo hotel (2 nights) → Shinkansen → Kyoto ryokan (2 nights) → ITM departure.
    Reservations span flight/lodging/transit/activity types across days/cities.
  - **Asserts:** all 6 days enumerated; arrival flight + check-in share day 1;
    checkout/transit/check-in all intersect the changeover day (03-16); city labels
    derive from lodging geocode (Tokyo, Kyoto) and fall back to the departure flight
    location (Osaka) when no lodging covers the night; city groups ordered
    Tokyo > … > Osaka with a url-safe slug; `nightOfM` gives 1/2, 2/2, and null on
    checkout morning; transit pair Tokyo hotel → Kyoto ryokan emitted with correct
    geocode from/to queries; `deleteTrip` FK-cascades the reservations away.
  - **No new harness/services needed** — reused `createHarness` and the DB port; no
    mocks (this pathway has no network boundary). No storage import, so no new hatch.
  - **Gates (all green, exit 0):** `pnpm typecheck`, `pnpm lint` (0 warnings),
    `pnpm smoke`, `pnpm test:e2e` (48 assertions pass: 14 pathway 1 + 34 pathway 4).

## P2 — Pathway 4 (trip lifecycle + itinerary derivation) — outcome
- **Files added:** `tests/e2e/trip-lifecycle.e2e.ts` (untracked — orchestrator to commit).
- **Files changed:** `docs/overnight/PROGRESS.md`.
- **Pathway test:** `tests/e2e/trip-lifecycle.e2e.ts`. Run with `pnpm test:e2e` from the repo
  root (discovers all `tests/e2e/*.e2e.ts`; non-zero exit on any failed assertion).
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":48}`.
- **Blockers:** none.

## P3 — Pathway 3 (manual reservation CRUD + re-sync edit-guard) — DONE
- **Service completeness:** no new service code needed. `createReservation`,
  `updateReservation(id, patch, { manual })` (stamps `manually_edited_at` via `nowIso()`
  when `manual:true`), `deleteReservation`, `findDuplicateReservation`, and the
  two-branch edit-guard in `candidates.autoPromoteAboveThreshold` (marks a dup
  candidate `merged_into` and only calls `updateReservation(dup, .., { manual:false })`
  when `dup.manually_edited_at` is null) were all already present and correct.
- **`tests/e2e/manual-crud.e2e.ts`** drives the REAL services through the DB port:
  - A) MANUAL CREATE — `createReservation(source:'manual')` persists + lands on its day
    in `buildItineraryDays`.
  - B) MANUAL EDIT — `updateReservation(id, {title}, { manual:true })` changes the field
    and stamps a non-null `manually_edited_at`.
  - C) EDIT-GUARD (protected) — a hi-conf gmail candidate whose flight proposal dedups
    to the edited reservation (same carrier/flight_number/date — NOT the title) is marked
    `merged_into` pointing at the existing row, and the user's edited title is UNCHANGED;
    no duplicate row created.
  - D) UPDATE-ALLOWED — a SECOND, never-edited reservation + matching dup candidate IS
    overwritten from the proposal (`manual:false` branch ran), proving the two-branch
    behavior (not just "never overwrites"). Sync update leaves `manually_edited_at` null.
  - E) DELETE — `deleteReservation` removes it from `listReservationsForTrip` and from
    `buildItineraryDays` output.
  - Dedup is exercised through the REAL `findDuplicateReservation`/`dedup.ts`; flight key
    is date-only so jittered candidate times still dedup. All `assertEqual` compares
    primitives (no deepEqual needed).
- **UI (typecheck-gated):** `app/(consumer)/reservations/edit.tsx` — manual add/edit screen
  using `Input`/`Select`/`DateTimePicker`/`Button`, calling the real
  create/update/deleteReservation; inline edits pass `{ manual: true }`. Builds offset-aware
  ISO timestamps from the picker via `composeIso` + the trip's home timezone. Not the
  verification surface.
- **No harness changes** — reused `createHarness`. No storage import, so no new hatch.
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":71}`
  (71 = 14 pathway 1 + 23 pathway 3 + 34 pathway 4).
- **Blockers:** none. Pathways now at 3 of ≤5.

## P3 — Manual reservation CRUD + re-sync edit-guard — outcome
- **Files added:** `tests/e2e/manual-crud.e2e.ts`, `app/(consumer)/reservations/edit.tsx`
  (both untracked — orchestrator to commit).
- **Files changed:** `docs/overnight/PROGRESS.md`. No new service/harness code (existing
  `createReservation`/`updateReservation(...,{manual})`/`deleteReservation`/
  `findDuplicateReservation` + the two-branch edit-guard in
  `candidates.autoPromoteAboveThreshold` were already correct).
- **Pathway test:** `tests/e2e/manual-crud.e2e.ts`. Run with `pnpm test:e2e` from the repo
  root (discovers all `tests/e2e/*.e2e.ts`; non-zero exit on any failed assertion).
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":71}`.
- **Blockers:** none. Canonical pathways now at 3 of ≤5.

## P4 — Pathway 2 (upload → OCR → extract → review → timeline) — DONE
- **Prereq fixes (Node-runnability):**
  - `src/services/storage.ts`: removed the MODULE-TOP `import { Directory, File, Paths }
    from 'expo-file-system'`. The import is now deferred inside each function via
    `import('expo-file-system')` (mirrors extract.ts readFileAsBase64), so importing
    storage.ts under tsx/Node no longer loads the native module. `get`/`remove` became
    `async` as a result (no existing callers depended on the old sync signatures). Added a
    test hatch `__setStorageForTest(overrides | null)` plus `put/get/removeViaHatch`
    wrappers (mirrors extract.ts `__setExtractForTest`).
  - NEW `src/services/ocr.ts`: `ocrImage(uri)` production stub throws
    `'OCR native module not available'` (Apple Vision bridge not wired yet), plus
    `__setOcrForTest(fn | null)` and `ocrImageViaHatch` — same hatch shape as extract.ts.
- **NEW `src/services/syncUpload.ts`:** `runUploadSync({ uri, kind })` mirrors
  `runGmailSync`'s structure over the file→OCR→vision boundary, all via real
  services/hatches: `putViaHatch` → storage_uri, `ocrImageViaHatch`,
  `extractReservationFromAttachmentViaHatch({ ocr_text, image_uris:[storage_uri],
  source_ref })`, insert an `attachments` row (kind, storage_uri, ocr_text,
  extraction_run_id = the run id), `createCandidate(source='upload', source_ref = run id)`,
  trip auto-assign (single trip whose range contains start_at, same style as syncGmail) +
  sync-time dedup, then `autoPromoteAboveThreshold(threshold)`. CRITICAL invariant:
  `attachments.extraction_run_id === candidate.source_ref` (one minted uuid `runId`) so
  `acceptCandidate` back-fills `attachments.reservation_id` on accept. Re-exports the
  storage/ocr/extract hatches like syncGmail re-exports gmail/extract.
- **HARNESS (`tests/e2e/harness.ts`):** added `installMockStorage()` (records `put()`
  calls, returns deterministic `file:///mock/uploads/attachment-N.<ext>` storage uris,
  tracks "stored" set for get/remove), `installMockOcr(text | Map)`, and
  `installMockAttachmentExtract(build)` — the builder receives the orchestrator's args
  (incl. the minted `source_ref`) since the test can't know the run id ahead of time, so
  the proposal echoes the run id like the real extract.ts does. `teardown()` now also
  resets the storage + ocr hatches. Existing API untouched.
- **`tests/e2e/upload-to-timeline.e2e.ts`** drives the REAL `runUploadSync` through the DB
  port:
  - A (hi-conf auto-promote): a screenshot extracts ONE lodging (0.96 ≥ 0.9) in range.
    Asserts storage.put ran with the picked uri/kind; attachment row has the storage_uri +
    ocr_text + kind; candidate exists with `source='upload'` and auto-promoted to accepted;
    exactly one reservation (source='upload'); the attachment's `reservation_id` is ACTUALLY
    populated and == the new reservation id (linkage asserted, not inferred); and
    `buildItineraryDays` lands the lodging on the check-in day.
  - B (lo-conf manual accept): a PDF extracts a 0.55 dining → stays pending; attachment
    `reservation_id` is null before accept; the REAL `acceptCandidate(id,{trip_id})` accepts
    AND the attachment's `reservation_id` is populated == accepted reservation id afterward;
    timeline includes the dining on its day. All `assertEqual` compares primitives.
- **UI (typecheck-gated):** `app/(consumer)/upload.tsx` — pick a screenshot
  (expo-image-picker) or PDF (expo-document-picker) → REAL `runUploadSync`, shows
  idle/running/done/error progress and routes back. Not the verification surface.
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":106}`
  (106 = 14 pathway 1 + 23 pathway 3 + 34 pathway 4 + 35 pathway 2).
- **Blockers:** none. Canonical pathways now at 4 of ≤5 (cross-path dedup is the 5th, P5).

## P4 — Pathway 2 (upload → OCR → extract) — outcome
- **Files added:** `src/services/ocr.ts`, `src/services/syncUpload.ts`,
  `tests/e2e/upload-to-timeline.e2e.ts`, `app/(consumer)/upload.tsx` (untracked —
  orchestrator to commit).
- **Files changed:** `src/services/storage.ts` (deferred expo-file-system import + hatch),
  `tests/e2e/harness.ts` (mock storage/ocr/attachment-extract + teardown), this log.
- **Pathway test:** `tests/e2e/upload-to-timeline.e2e.ts`. Run with `pnpm test:e2e`.
- **Blockers:** none. Pathways now at 4 of ≤5.

## P5 — Pathway 5 (cross-path dedup: Gmail + Upload → ONE reservation) — DONE
- **Contract:** the same logical reservation arriving via BOTH ingestion paths collapses to
  exactly ONE reservation row, enforced by PRODUCTION code (shared `dedup.ts` +
  `reservations.findDuplicateReservation`, called from BOTH `runGmailSync` and `runUploadSync`
  at sync time, and again inside `candidates.autoPromoteAboveThreshold` before any reservation
  is created). The test does NOT encode dedup.
- **No service changes needed** — both orchestrators already call `findDuplicateReservation`
  before creating a reservation, and `autoPromoteAboveThreshold` re-checks for a dup and marks
  the candidate `merged_into` (pointing at the existing reservation) instead of inserting a
  second row. Verified the contract holds in both orderings without touching production code.
- **`tests/e2e/cross-path-dedup.e2e.ts`** drives the REAL `runGmailSync` + `runUploadSync`
  through the DB port:
  - CASE 1 (Gmail first, then Upload): gmail auto-promotes a hi-conf flight (NH 110, 2026-03-15
    Asia/Tokyo) → ONE reservation (source='gmail'). An upload of the SAME logical flight (DIFFERENT
    title + a seat + a different time-of-day, all of which are deliberately NOT in the flight dedup
    key of carrier/flight_number/date-in-zone) then runs: STILL exactly ONE reservation, it's the
    original gmail row, the upload candidate is status='merged_into' with
    merged_into_reservation_id == the gmail reservation id, and the upload's attachments row was
    STILL created (file kept despite the dedup).
  - CASE 2 (reverse order, SEPARATE fresh harness): upload auto-promotes first (source='upload'),
    then gmail syncs the same flight → still ONE reservation, gmail candidate merged_into the upload
    reservation. Proves dedup is order-independent / lives in shared code, not one path.
  - CASE 3 (negative control): a DIFFERENT flight (flight_number 22) via the second path creates a
    SECOND reservation (candidate accepted, not merged) — proves the dedup key actually discriminates
    and the test isn't trivially always-merging.
  - All `assertEqual` compares primitives (counts, ids, status strings) per the Object.is runner.
- **Test-harness note (NOT a production bug):** CASE 2 stands up a second `createHarness()` inside the
  running test; its `teardown()` nulls the module-global hatches, INCLUDING the DB port
  (`__setDbForTest(null)`). The test re-injects CASE 1's harness DB via `__setDbForTest(harness.db)`
  after the nested teardown so CASE 3 keeps talking to the in-memory DB instead of falling through to
  the lazy expo-sqlite client (which would crash under Node). Production code is untouched.
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":139}`
  (139 = 14 pathway 1 + 23 pathway 3 + 34 pathway 4 + 35 pathway 2 + 33 pathway 5).
- **Blockers:** none. Canonical pathways now at the FINAL 5 of ≤5:
  gmail-to-timeline, trip-lifecycle, manual-crud, upload-to-timeline, cross-path-dedup.

## P5 — Pathway 5 (cross-path dedup) — outcome
- **Files added:** `tests/e2e/cross-path-dedup.e2e.ts` (untracked — orchestrator to commit).
- **Files changed:** `docs/overnight/PROGRESS.md`. No new service/harness code (existing shared
  `dedup.ts` + `findDuplicateReservation` + the dedup branch in `autoPromoteAboveThreshold`,
  called by BOTH `runGmailSync` and `runUploadSync`, already enforce the contract).
- **Pathway test:** `tests/e2e/cross-path-dedup.e2e.ts`. Run with `pnpm test:e2e`.
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":139}`.
- **Blockers:** none. The set of 5 MVP end-to-end pathways is COMPLETE.

## P5 — Cross-path dedup contract (Gmail + Upload -> one reservation)
- **Files added:** `tests/e2e/cross-path-dedup.e2e.ts` (untracked — orchestrator to commit).
- **Files changed:** `docs/overnight/PROGRESS.md`. No new service/harness code: the contract is
  enforced by PRODUCTION code already in place — shared `src/services/dedup.ts` +
  `reservations.findDuplicateReservation`, called at sync time by BOTH `runGmailSync` and
  `runUploadSync`, and re-checked inside `candidates.autoPromoteAboveThreshold` (marks the second
  candidate `merged_into` instead of inserting a second reservation). The test does NOT encode dedup.
- **What it proves:** the same logical reservation arriving via both ingestion paths collapses to
  exactly ONE row. CASE 1 Gmail-then-Upload, CASE 2 Upload-then-Gmail (separate harness, order-
  independent), CASE 3 negative control (a genuinely different flight creates a 2nd reservation).
  Attachment rows are kept even when the upload candidate is merged.
- **Pathway test + how to run:** `tests/e2e/cross-path-dedup.e2e.ts`. Run with `pnpm test:e2e` from
  the repo root (discovers all `tests/e2e/*.e2e.ts`; non-zero exit on any failed assertion).
- **Gate results:** `{"tc":"pass","lint":"pass","smoke":"pass","e2e":"pass","n":139}`.
- **Blockers:** none. Canonical pathways COMPLETE at the final 5 of ≤5.
