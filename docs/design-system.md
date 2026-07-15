# trip-os Design System — "Daylight Departure Board"

A design system for trip-os, derived from the Flighty app (Apple Design Award
for Interaction, 2023) and translated onto a **light, bright, cool** palette.

Flighty's craft comes from a single move: it borrows the visual language of
airport departure boards — refined over 50+ years to communicate flight status
to stressed travelers at a glance — and brings it to mobile. One line per item,
color-coded status, only the information that matters, "front and center" so the
app "feels almost boringly obvious." This system takes that DNA (status-driven,
glanceable, calm, data-dense) and renders it in daylight rather than Flighty's
dark board.

> Scope: this document plus the tokens in [`tailwind.config.js`](../tailwind.config.js)
> **are** the system. The existing primitives in `src/components/ui/` inherit the
> tokens automatically; they are documented here but not rebuilt. See
> [Adoption notes](#adoption-notes) for the known follow-ups.

---

## Table of contents

1. [Principles](#1-principles)
2. [Foundations (tokens)](#2-foundations-tokens)
   - [Color](#color)
   - [The status model](#the-status-model)
   - [Typography](#typography)
   - [Spacing](#spacing)
   - [Radius & elevation](#radius--elevation)
   - [Motion](#motion)
3. [Components](#3-components)
4. [Patterns](#4-patterns)
5. [Usage guidelines](#5-usage-guidelines)
6. [Adoption notes](#adoption-notes)

---

## 1. Principles

These are the rules a screen is measured against. When two of them conflict,
the higher one wins.

1. **Glanceable first.** A traveler should get the answer to "what now?" in well
   under a second. The single most important fact on any screen — the next
   reservation, the day, a status change — is the largest, highest-contrast
   element. Everything else is secondary by construction.

2. **Status is a color, not a sentence.** State (on time, delayed, cancelled,
   confirmed, past, unknown) is encoded as color + a one-word label, never as a
   paragraph the user has to parse. The [status model](#the-status-model) is the
   vocabulary; nothing invents its own status colors.

3. **One line per thing.** Borrowed directly from the departure board. A
   reservation, a leg, a day — each reads as a single scannable row: time ·
   type · title · status. Detail lives *behind* the row, not in it.

4. **Progressive disclosure.** Above the fold: what you need now. On scroll or
   tap: the rest. We never front-load detail to look thorough; density is earned
   by relevance, not volume.

5. **Boringly obvious.** No cleverness that needs a tutorial. Familiar controls,
   predictable placement, labels that say what they mean. The reward for good
   design here is that nobody notices it.

6. **Calm under stress.** Travel is stressful; the UI must subtract load, not
   add it. Restrained motion, generous spacing, no alarmist color unless
   something is genuinely wrong. Bright ≠ loud.

7. **Numbers are typeset.** Times, gates, seat numbers, confirmation codes,
   durations, counts — set in the [mono family](#typography) with tabular
   alignment so they sit still and read like a board, not like prose.

---

## 2. Foundations (tokens)

All tokens live in [`tailwind.config.js`](../tailwind.config.js) under
`theme.extend` and are consumed through NativeWind classes (`bg-status-good`,
`text-ink-muted`, `font-mono`, …). Token **names** are preserved from the prior
warm theme so existing components adopt the system unchanged.

### Color

The palette is cool and high-luminance. Surfaces are near-white; ink is a
cool near-black; brand and status carry all the saturation. Nothing in the base
palette is warm.

#### Neutrals — text

| Token | Hex | Role | Min. use |
|---|---|---|---|
| `ink` | `#14161b` | Primary text, headlines | Any size |
| `ink-soft` | `#3c424e` | Secondary text, body detail | Any size |
| `ink-muted` | `#6b7280` | Labels, captions, placeholders, timestamps | ≥12px / tertiary only |

#### Surfaces

| Token | Hex | Role |
|---|---|---|
| `paper` | `#ffffff` | Base canvas and cards |
| `paper-warm` | `#eef2f7` | Secondary surface, secondary-button fill *(name retained; no longer warm)* |
| `paper-dim` | `#d9dfe8` | Borders, hairlines, dividers, pressed-secondary |

Separation on a white-on-white canvas comes from **borders + elevation**, not
from a tinted background. A card is `paper` with a `paper-dim` border and a soft
shadow (see [Radius & elevation](#radius--elevation)).

#### Brand

| Token | Hex | Role |
|---|---|---|
| `brand` | `#1857c4` | Primary interactive accent, links, focus rings |
| `brand-soft` | `#e6eefb` | Tinted background for selected/active states |
| `brand-deep` | `#0f3e94` | Pressed state of brand surfaces |

> Note: the primary **Button** intentionally uses `ink` (near-black) as its
> fill for maximum contrast and calm. `brand` is for links, selection, focus,
> and accent affordances — not every button needs to be blue.

### The status model

This is the system's signature and the most direct inheritance from Flighty.
Every stateful thing maps to exactly one of **six** semantic states. Each state
has a solid value (for fills, dots, and text) and a `*Soft` tint (for the
background of a chip or row). Solids clear ≥4.5:1 contrast on white for small
text; each soft pairs with its own solid for text-on-tint.

| State | Solid | Soft | Meaning in trip-os |
|---|---|---|---|
| **Good** | `status-good` `#157f45` | `status-goodSoft` `#e4f5ea` | Confirmed, on time, checked-in, complete |
| **Warn** | `status-warn` `#9a6800` | `status-warnSoft` `#fbf0d4` | Needs attention, minor delay, action soon, low confidence |
| **Alert** | `status-alert` `#c5302b` | `status-alertSoft` `#fbe6e5` | Cancelled, conflict, failed, error |
| **Info** | `status-info` `#1857c4` | `status-infoSoft` `#e6eefb` | In progress, informational, live now |
| **Neutral** | `status-neutral` `#5a6473` | `status-neutralSoft` `#eceef2` | Past, inactive, unknown, not-yet-relevant |
| **Brand** | `brand` `#1857c4` | `brand-soft` `#e6eefb` | Selected / user-chosen (distinct from Info by context) |

Rules:

- A state badge is **soft background + solid text + one word** (`On time`,
  `Delayed`, `Cancelled`, `Confirmed`, `Past`). Never a full sentence.
- Use **solid fills with white text** only for type identity
  ([reservation types](#reservation-types)) and dots, not for status chips —
  status chips read better as soft+solid and stay calm.
- Green and red are reserved for genuine good/bad. Don't use green decoratively.

#### Reservation types

Type identity (what kind of thing) is orthogonal to status (how it's doing).
Type colors are saturated enough to carry **white** text on a solid fill, as in
`ReservationBadge`.

| Token | Hex | Type |
|---|---|---|
| `type-flight` | `#1857c4` | Flight (azure — air) |
| `type-lodging` | `#6f3ce0` | Lodging (violet — stay) |
| `type-dining` | `#c25e15` | Dining (tangerine — food) |
| `type-activity` | `#157f45` | Activity (green — explore) |
| `type-transit` | `#0b6678` | Transit (teal — ground) |

#### Accent (legacy aliases)

Kept for `ConfidenceChip` (forest/ochre/slate) and `Input` error text (rust),
each mapped onto the status spectrum so confidence reads as status:

| Token | Hex | Aliases | Used by |
|---|---|---|---|
| `accent-rust` | `#c5302b` | = `status-alert` | Input error text |
| `accent-forest` | `#157f45` | = `status-good` | ConfidenceChip (high) |
| `accent-ochre` | `#9a6800` | = `status-warn` | ConfidenceChip (medium) |
| `accent-plum` | `#6f3ce0` | = `type-lodging` | available |
| `accent-slate` | `#5a6473` | = `status-neutral` | ConfidenceChip (low) |

> Prefer `status-*` / `type-*` in new code. The `accent-*` names exist only so
> the current primitives keep working; treat them as deprecated.

### Typography

Three families, each with a job. Two are already wired into NativeWind; `mono`
is new and is the departure-board voice.

| Family | Token | Stack | Use |
|---|---|---|---|
| Sans | `font-sans` | System (SF Pro) | Body, labels, buttons — the default |
| Serif | `font-serif` | Georgia | Editorial headings: day dates, empty-state titles |
| Mono | `font-mono` | Menlo / SF Mono | **Numerics**: times, gates, seats, codes, durations, counts |

**Scale** (Tailwind defaults, with assigned roles — use these classes):

| Class | px | Role |
|---|---|---|
| `text-3xl` | 30 | Hero / day date (serif) |
| `text-2xl` | 24 | Screen / empty-state title (serif) |
| `text-xl` | 20 | Section heading |
| `text-base` | 16 | Body, primary row title |
| `text-sm` | 14 | Secondary detail |
| `text-xs` | 12 | Captions, timestamps |
| `text-[10px]` | 10 | Badge / chip labels, uppercase |

**Conventions**

- **Labels & metadata**: `text-xs uppercase tracking-wider text-ink-muted`. This
  is the board-label voice — used for field labels, times, weekday.
- **Numerics**: add `font-mono` and prefer tabular figures so columns of times
  align. Example: `font-mono text-base text-ink` for a departure time.
- Body line-height stays at Tailwind defaults; don't tighten below `leading-snug`
  for multi-line text.

### Spacing

4-pt base grid (Tailwind's default `1 = 4px`). Use the standard scale; the
roles below keep rhythm consistent:

| Token | px | Role |
|---|---|---|
| `1` | 4 | Hairline gaps, badge inset |
| `2` | 8 | Inline gaps between related items |
| `3` | 12 | Control padding (Y), tight stacks |
| `4` | 16 | **Default** card/screen padding, section gaps |
| `5` | 20 | Sheet horizontal padding |
| `6`–`8` | 24–32 | Section separation, empty-state padding |

Screen gutter is `4` (16px). Card interior is `4`. Don't introduce arbitrary
pixel values; round to the grid.

### Radius & elevation

| Token | px | Role |
|---|---|---|
| `rounded` | 4 | Chips, tight tags |
| `rounded-xl` | 12 | Buttons, inputs, selects |
| `rounded-2xl` | 16 | Cards |
| `rounded-3xl` | 24 | Bottom sheets / modal sheets (top corners) |
| `rounded-full` | — | Pills (ReservationBadge), dots, avatars |

**Elevation** is deliberately shallow — calm, not floaty. One step:

- Raised card: `shadow-md shadow-ink/10` + `border border-paper-dim`.
- Sheets/modals: scrim `bg-ink/40` behind, surface in `paper`.
- Avoid stacking multiple shadow levels on one screen; depth is a hint, not a
  theme.

### Motion

Restrained and quick. (RN/Reanimated — these are guidelines, not Tailwind
tokens.)

| Token | Duration | Use |
|---|---|---|
| `fast` | 120ms | Press feedback, color/opacity changes |
| `base` | 200ms | Most transitions, fades, chip changes |
| `slow` | 320ms | Sheet present/dismiss, layout shifts |

Easing: standard ease-out for enter, ease-in for exit. **Status changes may
pulse once** (a brief opacity or scale tick) to draw the eye — but only on a
genuine state change, never on a loop. No decorative looping animation.

---

## 3. Components

The blessed primitives in `src/components/ui/`, documented as system parts.
Verticals **must not** roll their own — extend these. (Open the live showcase at
`/dev/primitives`.)

### Button — `Button.tsx`
- **Variants**: `primary` (`ink` fill, `paper` text), `secondary`
  (`paper-warm` fill, `ink` text), `ghost` (transparent, `ink` text).
- **Sizes**: `sm`, `md`. Radius `rounded-xl`. Text `font-medium`, centered.
- **Guidance**: one primary action per view. Use `brand` for links/accents, not
  for the primary button. Pressed states are built in (`active:` classes).

### Card — `Card.tsx`
- **Variants**: `raised` (default — `shadow-md shadow-ink/10` + `paper-dim`
  border) and `plain`. `paper` fill, `rounded-2xl`, `p-4`.
- **Guidance**: the default container. Don't nest raised cards.

### ReservationBadge — `ReservationBadge.tsx`
- A `rounded-full` pill, solid `type-*` fill, `text-paper` (white),
  `text-[10px] uppercase tracking-wider`. Encodes **type**, not status.
- **Guidance**: pair with a separate status chip when state matters.

### ConfidenceChip — `ConfidenceChip.tsx`
- Maps an extraction confidence (0–1) to status color: ≥0.9 `accent-forest`
  (good), ≥0.7 `accent-ochre` (warn), else `accent-slate` (neutral). Shows `%`.
- **Guidance**: this is the canonical example of "confidence = status." Surface
  it on auto-extracted reservations so users know what to double-check.

### Timeline — `Timeline.tsx`
- One row per item: a `type-*` dot + connector hairline (`paper-dim`), then
  `time` (`text-xs uppercase ink-muted`) · `ReservationBadge` · `title`
  (`text-base font-medium ink`) · optional `detail`.
- **Guidance**: the embodiment of "one line per thing." Times should adopt
  `font-mono` (see [Adoption notes](#adoption-notes)).

### DayHeader — `DayHeader.tsx`
- `date` in `font-serif text-3xl ink`; optional `weekday`
  (`text-xs uppercase tracking-widest ink-muted`), `label`, and a right
  accessory slot.
- **Guidance**: the day is the hero of a day view — keep it the largest element.

### EmptyState — `EmptyState.tsx`
- Centered `font-serif text-2xl` title, optional `ink-muted` description
  (`max-w-xs`), optional action slot.
- **Guidance**: say what's missing and give one action. Calm, not apologetic.

### Input — `Input.tsx`
- Optional uppercase label, `border-paper-dim` + `bg-paper` + `rounded-xl`
  field, optional `accent-rust` error line.
- **Guidance**: placeholder color is currently hardcoded warm — see
  [Adoption notes](#adoption-notes).

### Select — `Select.tsx`
- Trigger styled like Input; opens a bottom-anchored modal (`bg-ink/40` scrim,
  `paper` sheet, `rounded-t-3xl`) with a divided option list.

### DateTimePicker — `DateTimePicker.tsx`
- Wraps the community picker; keep field styling consistent with Input/Select.

### BottomSheet — `BottomSheet.tsx`
- Gorhom sheet, `paper` background, `ink-muted` handle, default snaps
  `['40%','85%']`, pan-down-to-close.
- **Guidance**: background/handle are currently hardcoded warm hex — see
  [Adoption notes](#adoption-notes).

### PullToRefresh — `PullToRefresh.tsx`
- Standard refresh wrapper; tint the spinner with `brand`.

---

## 4. Patterns

Compositions the system expects, beyond single components.

- **Reservation row** = `time (mono)` · `ReservationBadge (type)` ·
  `title` · `status chip (soft+solid)`. The atomic departure-board line; build
  Timeline rows and list rows from this shape.
- **Status chip** = soft background (`status-*Soft`) + solid text
  (`status-*`) + one word, `rounded-full px-2.5 py-0.5 text-[10px] uppercase`.
- **Day view** = `DayHeader` (hero date) → `Timeline` of reservation rows →
  `EmptyState` when a day is empty.
- **Review queue** (extraction) = `Card` per candidate + `ConfidenceChip` +
  type/field editing via `Input`/`Select`. Confidence drives what the user
  reviews first (lowest confidence on top).
- **Live / now** = the current or next reservation gets `status-info` treatment
  and sits above the fold — the "what now?" answer.

---

## 5. Usage guidelines

**Do**
- Lead with the single most important fact, largest and highest-contrast.
- Use the [status model](#the-status-model) for all state; one word + color.
- Set all numerics in `font-mono`.
- Keep one primary action per screen.
- Earn density through relevance; default to progressive disclosure.

**Don't**
- Invent status colors or reuse green/red decoratively.
- Put a sentence where a status chip belongs.
- Stack raised cards or multiple shadow levels.
- Reintroduce warm hues — the system is deliberately cool.
- Add looping/decorative motion.

**Accessibility**
- Body text ≥4.5:1 against its surface; `ink-muted` is for ≥12px tertiary text
  only. Status solids are pre-checked at ≥4.5:1 on white.
- Never rely on color alone for status — always pair with the one-word label.
- Respect `prefers-reduced-motion`; status pulses must be suppressible.

---

## Adoption notes

The token re-value is live, so all primitives that reference tokens already
render in the new bright system. Three follow-ups remain (intentionally **not**
done here — this pass is system-only, no component refactor):

1. **`Input.tsx:16`** — `placeholderTextColor="#a39787"` is a hardcoded warm
   grey. Replace with the `ink-muted` value (`#6b7280`).
2. **`BottomSheet.tsx:33-34`** — `backgroundStyle` `#fbf7f0` and
   `handleIndicatorStyle` `#6b6058` are hardcoded warm. Replace with `paper`
   (`#ffffff`) and `ink-muted` (`#6b7280`). (Gorhom needs raw hex, not classes.)
3. **Numerics → mono** — `Timeline.tsx` times and any time/code/seat displays
   should add `font-mono` for the board look (Principle 7).

When a `Theme`/tokens TS module is introduced, the three hardcoded hex sites
above should import from it rather than literal strings, so RN-style props stay
in sync with the Tailwind tokens.
