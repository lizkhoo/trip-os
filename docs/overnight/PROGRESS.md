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
_(P1 will fill this in: the `pnpm test:e2e` command and the final ≤5 pathway names.)_

## Phase log
- P1 Foundation: PENDING
