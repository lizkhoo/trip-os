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
- [ ] Pathway 2 — upload → OCR → extract. (P4/P5)
- [ ] Pathway 5 — cross-path dedup. (P5/P6)

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
