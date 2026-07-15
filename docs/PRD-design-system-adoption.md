# PRD — Adopt the "Daylight Departure Board" design system across trip-os

**Status:** Draft · **Owner:** TBD · **Date:** 2026-06-27
**Depends on:** [`docs/design-system.md`](design-system.md) · tokens in [`tailwind.config.js`](../tailwind.config.js)
**Related:** [`docs/PRD.md`](PRD.md) (product spec)

---

## 1. Summary

The design system has landed at the **token + documentation** layer: tokens are
re-valued light/bright/cool and the spec is written. But the app has not yet
*adopted* it. Components inherit the new token values automatically, yet the
product still ships pre-system patterns: hardcoded warm hex in 13 places, no
status model on reservations, prose where status chips belong, and no mono
numerics. This PRD defines the work to bring the running app up to the system —
to make trip-os actually *look and behave* like "Daylight Departure Board."

The north star is the system's first principle: a traveler gets the answer to
**"what now?"** in under a second, with status read as color, one line per
thing, and the most important fact biggest.

## 2. Background & motivation

trip-os is an Expo/React Native itinerary app: connect Gmail or upload
screenshots → reservations are extracted → a day-by-day timeline renders the
trip. The visual layer was a warm editorial theme; we've replaced it with a
Flighty-derived, status-driven bright system (PR #10).

Re-valuing tokens flipped the palette everywhere automatically, **but two gaps
remain**:

1. **Token leakage.** 13 sites bypass tokens with literal warm hex (see audit).
   They now visibly clash with the cool/bright system.
2. **The system's signature is unused.** The whole point of the Flighty
   inheritance — *glanceable, color-coded status* — has no expression in the
   product yet. Reservations have no status; times aren't typeset; rows aren't
   composed as departure-board lines.

Closing these turns a re-skinned app into a designed one.

## 3. Goals / non-goals

**Goals**
- G1. Zero hardcoded color hex in `app/` and `src/components/`; everything flows
  from tokens.
- G2. A reusable **`StatusChip`** primitive and a reservation **status model**,
  wired into the timeline and review queue.
- G3. Numerics (times, codes, durations, counts) set in `font-mono`.
- G4. Each key screen composed to the system's patterns (reservation row, day
  view, review queue, "what now?").
- G5. The `/dev/primitives` showcase demonstrates every token group and the new
  components.

**Non-goals**
- New product features (no new ingestion, no maps, no Live Activities — those
  live in [`docs/PRD.md`](PRD.md)).
- A dark mode. The system is intentionally single-mode (light) for now.
- Renaming token keys (`paper-warm` etc. keep their names; see system doc).
- Backend/schema changes beyond an optional derived status field (§6.2).

## 4. Success metrics

- **M1.** `grep -rn '#[0-9a-fA-F]\{6\}' app src/components` returns 0 color
  literals (icon/asset exceptions documented inline).
- **M2.** Every reservation row renders type + a status chip; status is never a
  full sentence.
- **M3.** All time/code/number displays use `font-mono`.
- **M4.** `pnpm typecheck` and `pnpm lint` pass; the trip-lifecycle e2e still
  passes.
- **M5.** Design review against the 7 principles in `docs/design-system.md`
  passes for the home, day, and review screens.

## 5. Current-state audit

### 5.1 Hardcoded hex (13 sites → must move to tokens)

| File:line | Literal | Should be |
|---|---|---|
| `app/_layout.tsx:35` | `#1f1a17` (ActivityIndicator) | `ink` `#14161b` |
| `app/_layout.tsx:46` | `#fbf7f0` (headerStyle bg) | `paper` `#ffffff` |
| `app/dev/_layout.tsx:7` | `#fbf7f0` (header bg) | `paper` |
| `app/dev/_layout.tsx:8` | `#1f1a17` (headerTint) | `ink` |
| `app/(consumer)/index.tsx:46` | `#b04a2a` (+ New) | `brand` `#1857c4` |
| `app/(consumer)/trips/[id]/index.tsx:100` | `#6b6058` (spinner) | `ink-muted` `#6b7280` |
| `app/(consumer)/trips/[id]/index.tsx:128` | `#b04a2a` (Review) | `brand` |
| `app/(admin)/review/[id].tsx:86` | `#6b6058` (spinner) | `ink-muted` |
| `src/components/HeaderBack.tsx:12` | `#b04a2a` (‹ Back) | `brand` |
| `src/components/ui/BottomSheet.tsx:33` | `#fbf7f0` (sheet bg) | `paper` |
| `src/components/ui/BottomSheet.tsx:34` | `#6b6058` (handle) | `ink-muted` |
| `src/components/ui/PullToRefresh.tsx:21` | `#6b6058` (tintColor) | `ink-muted` |
| `src/components/ui/Input.tsx:16` | `#a39787` (placeholder) | `ink-muted` |

These are RN-style props / native components that can't take Tailwind classes,
so they need a TypeScript token source (§6.1).

### 5.2 Missing system expression
- **No status anywhere.** `Reservation` has `confidence` and
  `manually_edited_at` but no operational status. The timeline shows type +
  detail only. (`app/(consumer)/trips/[id]/index.tsx`)
- **`ConfidenceChip` is the only status-shaped component.** It's the proof the
  pattern works; we generalize it into `StatusChip`.
- **Prose-as-status.** Details like `Night N of M`, `Conf XYZ` are concatenated
  into one string (`reservationDetail()`), not chips.
- **No mono.** `timeInZone()` output and confirmation codes render in the body
  sans font.
- **Headers** are configured ad hoc per screen with literal colors instead of a
  shared `screenOptions` default.

## 6. Requirements

### 6.1 Phase 0 — Token source for native props (foundation)
**Why:** RN props (`color=`, `backgroundColor`, `placeholderTextColor`,
`tintColor`) and `react-native-maps`/Gorhom can't consume Tailwind classes.
**What:** add `src/theme/tokens.ts` exporting the same values as
`tailwind.config.js` (single source of truth — ideally the Tailwind config
`require`s this module so they cannot drift).

```ts
// src/theme/tokens.ts  (illustrative)
export const color = {
  ink: '#14161b', inkSoft: '#3c424e', inkMuted: '#6b7280',
  paper: '#ffffff', paperWarm: '#eef2f7', paperDim: '#d9dfe8',
  brand: '#1857c4', brandSoft: '#e6eefb', brandDeep: '#0f3e94',
  status: { good:'#157f45', warn:'#9a6800', alert:'#c5302b', info:'#1857c4', neutral:'#5a6473',
            goodSoft:'#e4f5ea', warnSoft:'#fbf0d4', alertSoft:'#fbe6e5', infoSoft:'#e6eefb', neutralSoft:'#eceef2' },
  type: { flight:'#1857c4', lodging:'#6f3ce0', dining:'#c25e15', activity:'#157f45', transit:'#0b6678' },
} as const;
```
**Acceptance:** `tailwind.config.js` and `tokens.ts` share one definition; no
duplicated literal lists.

### 6.2 Phase 1 — Eliminate hardcoded hex (G1)
Replace all 13 sites in §5.1 with `tokens.ts` references. Add a shared header
default so `app/_layout.tsx`, `app/dev/_layout.tsx`, and per-screen
`Stack.Screen` options stop repeating `headerStyle`/`headerTintColor` literals.
**Acceptance:** M1 (grep = 0).

### 6.3 Phase 2 — Status model + `StatusChip` (G2)
**Domain:** define a `ReservationStatus` union and a pure derivation
`deriveStatus(reservation, now)` in `src/domain/` (or `src/lib/`). Suggested
states, mapped to the [status model](design-system.md#the-status-model):

| Status | Maps to | When |
|---|---|---|
| `confirmed` | good | Has confirmation code / manually verified |
| `needs_review` | warn | Auto-extracted, confidence < threshold |
| `cancelled` | alert | Marked cancelled |
| `in_progress` | info | `now` within start/end |
| `upcoming` | neutral | Future, confirmed |
| `past` | neutral | Ended |

> Decision needed: derive purely from existing fields (confidence /
> manually_edited_at / times), or add a persisted `status` column to the
> `reservations` table (migration + schema). Recommend **derive-only** first to
> avoid a migration; persist later only if user-set cancellation is needed.

**Component:** `src/components/ui/StatusChip.tsx` — soft bg + solid text + one
word, `rounded-full px-2.5 py-0.5 text-[10px] uppercase`, driven by the status →
color map. Generalize `ConfidenceChip` to render via `StatusChip` internally (or
keep it as a thin confidence-specific wrapper). Export from
`src/components/ui/index.ts`.
**Acceptance:** M2.

### 6.4 Phase 3 — Mono numerics (G3)
Add `font-mono` to: timeline times (`Timeline.tsx`), confirmation codes and
`Night N of M` counts, trip date ranges, the day date in `DayHeader` numerals if
desired. Prefer tabular alignment so time columns line up.
**Acceptance:** M3.

### 6.5 Phase 4 — Compose screens to the patterns (G4)
- **Reservation row** (`Timeline.tsx`): `time (mono)` · `ReservationBadge
  (type)` · `title` · `StatusChip`. Move `Night N of M`/`Conf` out of the prose
  detail string into chips/typeset fields.
- **Day view** (`trips/[id]/index.tsx`): keep DayHeader as hero; surface the
  day's worst status (e.g. any `needs_review`/`cancelled`) on the header
  accessory instead of only `ConfidenceChip`.
- **Home** (`(consumer)/index.tsx`): TripRow shows trip date range in mono; a
  small status summary (e.g. "2 need review") per trip.
- **"What now?"**: the current/next reservation gets `status-info` treatment and
  pins above the fold on the day view — the system's headline use case.
- **Review queue** (`(admin)/review/`): order candidates by lowest confidence;
  each card leads with its `StatusChip`.
**Acceptance:** M5 design review.

### 6.6 Phase 5 — Showcase + verification (G5)
- Extend `app/dev/primitives.tsx` to render every token group (neutrals,
  surfaces, brand, status solids+softs, types) and the new `StatusChip` in all
  states.
- Run `pnpm typecheck`, `pnpm lint`, the trip-lifecycle e2e, and a manual pass
  on simulator (home → day → review).
**Acceptance:** M4.

## 7. Dependency / sequencing

```
Phase 0 (tokens.ts)
   │
   ├──► Phase 1 (kill hex)            ─┐
   │                                   ├─► Phase 5 (showcase + verify)
   └──► Phase 2 (status model + chip) ─┤
            │                          │
            └──► Phase 3 (mono) ──► Phase 4 (compose screens)
```

Phase 0 unblocks everything that touches native props. Phases 1 and 2 are
independent and can run in parallel. Phase 4 depends on 2 and 3. Phase 5 is the
gate.

## 8. Rollout & risks

- **One PR per phase** (or per phase-pair) for reviewable diffs; each must pass
  typecheck + lint + e2e.
- **Risk — token drift:** mitigated by `tailwind.config.js` and `tokens.ts`
  sharing one definition (§6.1).
- **Risk — status mis-derivation:** keep `deriveStatus` pure and unit-tested;
  the trip-lifecycle e2e already owns timeline correctness.
- **Risk — contrast regressions:** status solids are designed ≥4.5:1 on white;
  add a one-time contrast check in review.
- **Risk — scope creep into features:** anything beyond visual/state adoption is
  out of scope and belongs in `docs/PRD.md`.

## 9. Open questions

1. **Persisted vs derived status** — derive-only first (no migration), or add a
   `status` column now to support user-set cancellations? (Recommend derive-only.)
2. **`ConfidenceChip` fate** — fold into `StatusChip`, or keep as a thin
   wrapper? (Recommend wrapper for back-compat.)
3. **Serif headings** — keep Georgia for day dates / empty states, or migrate to
   a sans display for a fully cool system? (Recommend keep for now; revisit.)
4. **Shared header config** — centralize in a `screenOptions` helper or a
   `<Stack>` default in `app/_layout.tsx`?

## 10. Out of scope

Maps, Live Activities / Dynamic Island, widgets, dark mode, new ingestion
sources, token renames, and any change to the data model beyond the optional
status field in §6.2.
