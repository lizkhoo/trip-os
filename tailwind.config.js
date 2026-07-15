/** @type {import('tailwindcss').Config} */
const { color } = require('./src/theme/token-values.js');

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── Design system: "Daylight Departure Board" ──────────────────
        // Values from src/theme/token-values.js (single source of truth).
        // Full spec: docs/design-system.md
        //
        // Token NAMES are preserved from the previous warm theme so existing
        // primitives in src/components/ui/ adopt this system without edits.

        ink: {
          DEFAULT: color.ink,
          soft: color.inkSoft,
          muted: color.inkMuted,
        },

        paper: {
          DEFAULT: color.paper,
          warm: color.paperWarm,
          dim: color.paperDim,
        },

        brand: {
          DEFAULT: color.brand,
          soft: color.brandSoft,
          deep: color.brandDeep,
        },

        status: {
          good: color.status.good,
          goodSoft: color.status.goodSoft,
          warn: color.status.warn,
          warnSoft: color.status.warnSoft,
          alert: color.status.alert,
          alertSoft: color.status.alertSoft,
          info: color.status.info,
          infoSoft: color.status.infoSoft,
          neutral: color.status.neutral,
          neutralSoft: color.status.neutralSoft,
        },

        type: {
          flight: color.type.flight,
          lodging: color.type.lodging,
          dining: color.type.dining,
          activity: color.type.activity,
          transit: color.type.transit,
        },

        accent: {
          rust: color.accent.rust,
          forest: color.accent.forest,
          ochre: color.accent.ochre,
          plum: color.accent.plum,
          slate: color.accent.slate,
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
