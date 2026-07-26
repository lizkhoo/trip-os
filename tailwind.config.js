/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── Design system: "Daylight Departure Board" ──────────────────
        // Light & bright, status-driven, glanceable. Derived from Flighty's
        // airport-board principles (color-coded status, one-line density,
        // boringly-obvious clarity) translated onto a cool, high-luminance
        // palette. Full spec: docs/design-system.md
        //
        // Token NAMES are preserved from the previous warm theme so existing
        // primitives in src/components/ui/ adopt this system without edits.

        // Neutrals — cool, near-black to mid-grey. Text + on-surface ink.
        ink: {
          DEFAULT: '#14161b', // primary text
          soft: '#3c424e', // secondary text
          muted: '#6b7280', // tertiary text, labels, placeholders
        },

        // Surfaces — bright, cool. `paper` is the base canvas/card; the
        // ramp steps down for secondary surfaces, then borders/dividers.
        paper: {
          DEFAULT: '#ffffff', // base surface / cards
          warm: '#eef2f7', // secondary surface / secondary button (name kept; no longer warm)
          dim: '#d9dfe8', // borders, hairlines, dividers, pressed-secondary
        },

        // Brand — vivid azure. Primary interactive accent, links, focus.
        brand: {
          DEFAULT: '#1857c4',
          soft: '#e6eefb', // tinted background for selected/active states
          deep: '#0f3e94', // pressed
        },

        // Status — the signature layer. Glanceable, color-coded state.
        // Solid value = fills/text; *Soft = tinted background. All solids
        // clear ≥4.5:1 on white for small text; softs pair with their solid.
        status: {
          good: '#157f45',
          goodSoft: '#e4f5ea',
          warn: '#9a6800',
          warnSoft: '#fbf0d4',
          alert: '#c5302b',
          alertSoft: '#fbe6e5',
          info: '#1857c4',
          infoSoft: '#e6eefb',
          neutral: '#5a6473',
          neutralSoft: '#eceef2',
        },

        // Reservation type tokens — used by ReservationBadge / Timeline.
        // Saturated enough to carry white text on a solid fill.
        type: {
          flight: '#1857c4', // azure — air/sky
          lodging: '#6f3ce0', // violet — rest/stay
          dining: '#c25e15', // tangerine — food
          activity: '#157f45', // green — explore/outdoors
          transit: '#0b6678', // teal — ground movement
        },

        // Accent — kept for ConfidenceChip (forest/ochre/slate) and
        // Input error text (rust). Aligned to the status spectrum.
        accent: {
          rust: '#c5302b', // = status.alert
          forest: '#157f45', // = status.good
          ochre: '#9a6800', // = status.warn
          plum: '#6f3ce0', // = type.lodging
          slate: '#5a6473', // = status.neutral
        },
      },
      fontFamily: {
        sans: ['System'], // body + UI
        serif: ['Georgia', 'serif'], // editorial headings (DayHeader, EmptyState)
        mono: ['Menlo', 'monospace'], // departure-board numerics: times, codes, durations
      },
    },
  },
  plugins: [],
};
