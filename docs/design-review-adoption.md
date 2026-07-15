# Design review — Design system adoption (issues #12–#18)

**Date:** 2026-07-15  
**Screens:** Home (trips), Day (trip detail), Review queue  
**Measured against:** the 7 principles in `docs/design-system.md`

## Verdict

**Pass** — home, day, and review now express the Daylight Departure Board system: status as color, mono numerics, and a pinned “what now?” answer on the day view.

## Principle checklist

| # | Principle | Home | Day | Review |
|---|---|---|---|---|
| 1 | Glanceable first | Trip title + status summary | What-now pin above the fold | StatusChip leads each card |
| 2 | Status is a color, not a sentence | Summary is short (“2 need review”) | StatusChip on every row + day header | StatusChip `Review` + confidence % |
| 3 | One line per thing | Trip row: title · dates · summary | time · type · title · status | chip · type · title |
| 4 | Progressive disclosure | Cover + title first; summary secondary | Pin first; timeline on scroll | Queue list → detail on tap |
| 5 | Boringly obvious | Familiar trip cards | Familiar day cards + clear “What now” | Familiar review cards |
| 6 | Calm under stress | Cool palette, no alarmist chrome | Info soft for pin; alert only for cancelled | Warn tone for needs_review |
| 7 | Numbers are typeset | Date range `font-mono` | Times, night counts, codes `font-mono` | Confidence via chip (numeric) |

## Notes

- Token hex literals are confined to `src/theme/token-values.js` (and the typed re-export); `app/` + `src/components/` have zero color literals.
- Operational status is **derived** (no migration); DB `confirmed`/`cancelled` still gates cancellation.
- ConfidenceChip remains a thin StatusChip wrapper for back-compat.
