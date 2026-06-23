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

1. **Pathway 1 — Gmail → review → timeline.** `tests/e2e/gmail-to-timeline.e2e.ts`. DONE.
2. Pathway 4 — trip lifecycle + itinerary derivation. (P2)
3. Pathway 1 finalize + review/timeline UI. (P3)
4. Pathway 3 — manual CRUD + edit-guard. (P4)
5. Pathway 2 — upload → OCR → extract. (P5)
6. Pathway 5 — cross-path dedup. (P6)

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
