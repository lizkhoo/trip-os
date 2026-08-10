# 0002 — Global incremental sync, per-trip backfill, assignment re-scoring

## Status

Accepted (2026-07-26)

## Context

Gmail sync is global and incremental: one query (sender allowlist + label fallback), advanced by `last_synced_at`. Trips now carry a per-trip booking window that hard-bounds which emails may belong to them (ADR 0001). The clash: a trip is often created *after* its confirmation emails arrived — those emails sit behind `last_synced_at`, and messages already processed are skipped by the seen-set. A naive per-trip fetch loop would fix this but re-queries overlapping windows on every sync and makes incrementality meaningless.

Key observation: **extraction is trip-independent; only assignment is trip-dependent.** A new trip never requires re-extracting an already-extracted email — only re-scoring its assignment.

## Decision

1. **Ongoing sync stays global and incremental.** One query: allowlist ∧ (union of all trips' booking windows) ∧ `after:last_synced_at`. Emails received in a period no booking window covers are never fetched.
2. **Trip creation (or booking-window widening) triggers a one-time backfill:** fetch allowlist-matching messages inside that trip's booking window that have no extraction candidate yet, and extract them.
3. **The same trigger re-scores assignment** for every pending / needs-trip candidate whose received date falls inside the new window, against the updated trip set. No re-extraction. Editing a trip's *destinations* triggers re-scoring only, never backfill — destinations change assignment evidence but not the fetch bounds (the booking window alone drives fetching).
4. **Already-promoted reservations are never touched** by re-scoring. Promotion settles a reservation; moving it later is a manual act. Silent retroactive reassignment would be surprising and destructive.

## Consequences

- `last_synced_at` keeps its meaning; steady-state sync cost is unchanged.
- Backfill cost is paid once per trip, proportional to its booking window — the natural moment, since the user just expressed intent.
- Candidates must be re-scorable: assignment inputs (received date, extracted reservation, raw text) must remain available on the candidate after initial processing.
- The seen-set skip applies to *extraction* only; re-scoring deliberately revisits seen candidates.

## Alternatives considered

- **Per-trip fetch every sync** — overlapping windows re-fetched constantly; incrementality lost.
- **Re-score everything including promoted reservations** — retroactively moves settled itinerary items; rejected as surprising.
