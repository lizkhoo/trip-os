# 0001 — Probabilistic trip assignment replaces the deterministic date-range rule

## Status

Accepted (2026-07-26)

## Context

The PRD listed trip auto-assignment as a resolved anchor: *incoming reservation date falls inside exactly one trip's range → auto-assign; zero or multiple matches → "needs trip" inbox*. `src/services/syncGmail.ts` implements exactly this, using dates alone.

This rule fails in the cases that matter most: overlapping trips (a work trip inside a vacation's date range), open-ended trips (no end date, so no range to test), and reservations whose dates sit near trip boundaries. Meanwhile, per-trip constraints now exist that carry stronger evidence than dates alone: a destination set ("Tokyo, Kyoto, Osaka") and geographic context (same country/region as a destination).

## Decision

Trip assignment is a probability judgment made by the AI, not a rule.

- **Hard bound:** the trip's booking window (email received dates) determines which emails are considered at all. This is the only deterministic filter.
- **Soft evidence:** trip dates, the destination set, geographic proximity (country/region containment, e.g. "Lyon" → France → a "Europe" trip), and email content are weighed together into an **assignment confidence** per candidate.
- Assignment confidence is **separate from extraction confidence** — "did I read this email correctly?" and "which trip is this for?" are independent questions. Blending them into one score makes the middle range uninterpretable.
- **Auto-promotion requires both scores** above threshold. The extraction threshold stays user-tunable (existing `auto_promote_threshold`); the assignment threshold is fixed initially — two knobs is too many for a single-user app.
- Below-threshold assignment → the needs-trip inbox, with the AI's best-guess trip pre-selected.

## Consequences

- The PRD's auto-assignment anchor is superseded by this ADR.
- Assignment outcomes are no longer deterministic or replayable from dates alone; the candidate row must record the assignment confidence (and ideally the best-guess trip) to keep decisions explainable.
- Wrong assignments are expected and cheap: the user reassigns, and those corrections (reassignments, edits, deletions) are candidate signals for a future feedback loop. No feedback mechanism is built now.
- Open-ended trips stop being a special case for assignment — a missing end date just means weaker date evidence, not a broken rule.

## Alternatives considered

- **Keep the date rule, destinations as soft suggestion only** — safe but destinations do no real work; every date-ambiguous email still needs manual triage.
- **Date rule first, destination match as deterministic fallback** — preserves determinism but can't weigh partial evidence (region proximity, near-boundary dates) and still breaks on open-ended trips.
