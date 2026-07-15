/**
 * Typed entry for the design-system color tokens.
 * Values live in `token-values.js` so `tailwind.config.js` can require the same module.
 */
import { color as colorRaw } from './token-values.js';

export const color = colorRaw as {
  readonly ink: '#14161b';
  readonly inkSoft: '#3c424e';
  readonly inkMuted: '#6b7280';
  readonly paper: '#ffffff';
  readonly paperWarm: '#eef2f7';
  readonly paperDim: '#d9dfe8';
  readonly brand: '#1857c4';
  readonly brandSoft: '#e6eefb';
  readonly brandDeep: '#0f3e94';
  readonly status: {
    readonly good: '#157f45';
    readonly goodSoft: '#e4f5ea';
    readonly warn: '#9a6800';
    readonly warnSoft: '#fbf0d4';
    readonly alert: '#c5302b';
    readonly alertSoft: '#fbe6e5';
    readonly info: '#1857c4';
    readonly infoSoft: '#e6eefb';
    readonly neutral: '#5a6473';
    readonly neutralSoft: '#eceef2';
  };
  readonly type: {
    readonly flight: '#1857c4';
    readonly lodging: '#6f3ce0';
    readonly dining: '#c25e15';
    readonly activity: '#157f45';
    readonly transit: '#0b6678';
  };
  readonly accent: {
    readonly rust: '#c5302b';
    readonly forest: '#157f45';
    readonly ochre: '#9a6800';
    readonly plum: '#6f3ce0';
    readonly slate: '#5a6473';
  };
};

export type ColorTokens = typeof color;
