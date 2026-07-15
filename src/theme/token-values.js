/**
 * Single source of truth for design-system colors.
 * Consumed by TypeScript (`tokens.ts`) and by `tailwind.config.js` so the two
 * cannot drift. Full spec: docs/design-system.md
 *
 * Token NAMES are preserved from the previous warm theme so existing NativeWind
 * classes keep working after the cool/bright re-value.
 */
'use strict';

const color = {
  // Neutrals — text
  ink: '#14161b',
  inkSoft: '#3c424e',
  inkMuted: '#6b7280',

  // Surfaces
  paper: '#ffffff',
  paperWarm: '#eef2f7',
  paperDim: '#d9dfe8',

  // Brand
  brand: '#1857c4',
  brandSoft: '#e6eefb',
  brandDeep: '#0f3e94',

  // Status solids + softs
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

  // Reservation types
  type: {
    flight: '#1857c4',
    lodging: '#6f3ce0',
    dining: '#c25e15',
    activity: '#157f45',
    transit: '#0b6678',
  },

  // Legacy accent aliases (ConfidenceChip / Input error)
  accent: {
    rust: '#c5302b',
    forest: '#157f45',
    ochre: '#9a6800',
    plum: '#6f3ce0',
    slate: '#5a6473',
  },
};

module.exports = { color };
