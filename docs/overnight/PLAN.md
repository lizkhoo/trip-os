# Overnight MVP run — orchestration plan

**Goal:** reach a set of **≤5 end-to-end MVP testing pathways** for Trip OS, each one a
Node-runnable integration test that drives the *real* service + orchestration code
(no simulator, no network), with the supporting feature gaps implemented.

**Branch:** `overnight-mvp` (off `gmail-ingestion`). Started 2026-06-22 evening PT.
**Lead orchestrator:** Claude Code main loop, advancing one phase per background Workflow,
committing between phases. Living status in `PROGRESS.md`.

## Why "testing pathways" = Node integration tests
There is no iOS simulator in this environment. The existing `scripts/smoke.ts` proved the
pattern but had to write a *divergent replica* of `runGmailSync` because every service does
`import { db } from '@/db/client'`, pinning `expo-sqlite` at module load. The keystone refactor
(Phase 1) makes the DB client lazy + injectable so drizzle can run on `better-sqlite3` in Node —
then the e2e pathways exercise the **actual** orchestrators, not copies. UI screens are built and
typecheck-gated but are not the verification surface (they can't render headlessly).

## The 5 MVP end-to-end pathways (the deliverable)
1. **Gmail → review → timeline.** Mock Gmail + mock Claude → real `runGmailSync` → candidates
   (hi-conf auto-promoted, lo-conf pending) → `acceptCandidate` → reservation appears in
   `buildItineraryDays` grouped by day/city.
2. **Upload → OCR → extract → review → timeline.** Mock file + mock OCR + mock Claude vision →
   real `runUploadSync` (new) → attachment stored + candidate → accept → reservation + attachment
   linked → on timeline.
3. **Manual reservation CRUD + edit-guard.** Manual create → edit (sets `manually_edited_at`) →
   re-sync must NOT overwrite the edited reservation → delete → timeline reflects each step.
4. **Trip lifecycle + itinerary derivation.** Create trip (date range + home tz) → add
   reservations across days/cities → `buildItineraryDays` / `getCityGroups` / `nightOfM` /
   `getTransitPairs` derive day cards, city groups, multi-night "night N of M", transit pairs.
5. **Cross-path dedup contract.** Same logical reservation arriving via Gmail and via Upload
   dedups to a single reservation (PRD step 10).

Final set may merge/trim to stay ≤5; PROGRESS.md records the canonical list + how to run them.

## Phases (each = one background Workflow, chained by the lead)
- **P0 (done, inline):** branch, promote sole-copy helpers, delete stale dupes, bump model id
  `claude-opus-4-7`→`claude-opus-4-8`, write these docs.
- **P1 Foundation:** lazy/injectable `@/db/client` (`getDb()` + `__setDbForTest`), `tests/e2e/`
  harness (better-sqlite3 + drizzle + migrations + hatches), `pnpm test:e2e` runner, convert the
  smoke gmail logic to drive REAL `runGmailSync` = pathway 1 first cut. Gate: typecheck+smoke+e2e green.
- **P2 Pathway 4** (trip lifecycle + derivation) — most self-contained, validates the harness.
- **P3 Pathway 1** (Gmail→review→timeline) finalize + review-queue/timeline UI (typecheck-gated).
- **P4 Pathway 3** (manual CRUD + edit-guard) + manual reservation UI.
- **P5 Pathway 2** (upload→OCR→extract) — `runUploadSync` with injectable OCR hatch + upload UI.
- **P6 Pathway 5** (cross-path dedup) + hardening: full typecheck/lint/smoke/e2e green, final report.

## Orchestrator protocol (per phase Workflow)
Single implementer at a time (shared working tree — no parallel file writes), then independent
verifier, then fixer-loop (≤3 rounds) until green, then adversarial reviewer. The lead commits
the phase, updates PROGRESS.md, launches the next phase. A fallback `ScheduleWakeup` heartbeat
guards against a workflow that never notifies.

## Invariants for every agent
- Run from repo root with `pnpm`. Gates: `pnpm typecheck`, `pnpm lint`, `pnpm smoke`, `pnpm test:e2e`.
- Never weaken a test to make it pass; never delete a pathway to go green. If blocked, leave it
  failing with a clear note in PROGRESS.md rather than faking success.
- e2e tests must import and call the real services/orchestrators via the DB port — not reimplement them.
- Keep changes on `overnight-mvp`. Do not touch `main`. Commit messages end with the Co-Authored-By trailer.
