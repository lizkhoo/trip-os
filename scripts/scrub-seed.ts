/**
 * Scrub PII from seed/japan-2026.private.json → seed/japan-2026.json.
 *
 * Why this exists: the repo is public, the private snapshot contains real passenger names,
 * airline PNRs, hotel reservation numbers, Priceline IDs, and personal notes. Scrub keeps the
 * structural richness (multi-night lodging, sub-events, transit pairs, dates, hotel names,
 * flight numbers) while replacing identifiers with format-preserving fakes.
 *
 * Determinism: same private input → same public output. Idempotent (running on already-scrubbed
 * input is a no-op).
 *
 * Run modes:
 *   pnpm scrub          → write the scrubbed snapshot
 *   pnpm scrub --check  → in-memory rescrub; diff vs committed file; exit 1 if drift.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(__dirname, '..');
const PRIVATE = path.join(ROOT, 'seed/japan-2026.private.json');
const PUBLIC = path.join(ROOT, 'seed/japan-2026.json');

type SubEvent = { time?: string; name?: string; detail?: string };
type Link = { name?: string; url?: string; map?: string };
type Day = {
  date: string;
  day: string;
  event: string;
  hotel?: string;
  city?: string;
  time?: string;
  details?: string;
  confirmation?: string;
  subEvents?: SubEvent[];
  links?: Link[];
};

// Stable placeholder pools.
const TRAVELERS = [
  'Traveler A',
  'Traveler B',
  'Traveler C',
  'Traveler D',
  'Traveler E',
  'Traveler F',
];
const PNR_POOL = [
  'AAAAAA',
  'BBBBBB',
  'CCCCCC',
  'DDDDDD',
  'EEEEEE',
  'FFFFFF',
  'GGGGGG',
  'HHHHHH',
];

// Patterns we strip outright (PII / personal logistics that don't help dev).
const STRIP_PHRASES = [
  /Provide passport information[^.]*\.?/gi,
  /Pay at hotel[^.]*\.?/gi,
  /Requested reservation @[^.]*\.?/gi,
  /pay on site/gi,
  /Early bird discount[^.]*\.?/gi,
];

// Labeled-secret patterns: replace the value with [REDACTED] entirely (no fake — the label
// being there at all is fine for testing UI handling).
const SECRET_LABEL_RE = /\b(Password|password|PWD|PIN|pin)\s*[:=]\s*\S+/g;

// Six-to-ten char alphanumeric tokens starting with a letter, possibly containing digits.
// Catches typical airline PNRs (both pure-alpha and letter+digit mixed).
const PNR_RE = /\b[A-Z](?=[A-Z0-9]{4,9}\b)[A-Z0-9]+\b/g;
// Long numeric reservation IDs (≥ 7 digits — won't match year-like 4-digit tokens).
const NUMERIC_ID_RE = /\b\d{7,}\b/g;
// Hyphenated reservation IDs (3-or-more groups of 3-4 digits).
const HYPHENATED_ID_RE = /\b\d{3,4}-\d{3,4}(?:-\d{3,4}){0,3}\b/g;
// Long mixed-case alphanumeric IDs (≥ 8 chars, must contain both a letter and a digit).
const MIXED_LONG_RE = /\b(?=[A-Za-z0-9]{8,}\b)(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+\b/g;
// Short lowercase mixed alphanumeric (5-7 chars, must contain both letter and digit).
// Only applied to confirmation field — too risky for free-text details.
const SHORT_MIXED_LOWER_RE = /\b(?=[a-z0-9]{5,7}\b)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]+\b/g;

const ALLOWLIST_PNRS = new Set<string>(['REDACTED']);

// Known passenger first/last names from the private file. We don't try to parse — instead, we
// substitute by exact token match from the confirmation strings, building a stable map per run.
function scrubText(input: string, ctx: ScrubContext, opts: { aggressive?: boolean } = {}): string {
  if (!input) return input;
  let s = input;

  // Strip personal phrases first so we don't accidentally template-replace IDs inside them.
  for (const re of STRIP_PHRASES) s = s.replace(re, '');
  s = s.replace(SECRET_LABEL_RE, '$1: [REDACTED]');

  // Hyphenated IDs before numeric (broader pattern wins last).
  s = s.replace(HYPHENATED_ID_RE, (m) => ctx.hyphenatedId(m));
  s = s.replace(MIXED_LONG_RE, (m) => ctx.mixedId(m));
  s = s.replace(NUMERIC_ID_RE, (m) => ctx.numericId(m));
  s = s.replace(PNR_RE, (m) => {
    if (ALLOWLIST_PNRS.has(m)) return m;
    return ctx.pnr(m);
  });
  if (opts.aggressive) {
    s = s.replace(SHORT_MIXED_LOWER_RE, (m) => ctx.shortMixed(m));
  }

  for (const real of ctx.knownNames()) {
    s = s.replace(new RegExp(`\\b${escapeRe(real)}\\b`, 'g'), ctx.nameFor(real));
  }

  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, '.').trim();
  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class ScrubContext {
  private nameMap = new Map<string, string>();
  private pnrMap = new Map<string, string>();
  private numericMap = new Map<string, string>();
  private hyphenatedMap = new Map<string, string>();
  private mixedMap = new Map<string, string>();
  private shortMap = new Map<string, string>();
  private knownNamesSet = new Set<string>();

  registerName(name: string): void {
    if (!this.knownNamesSet.has(name)) {
      this.knownNamesSet.add(name);
      const idx = this.nameMap.size;
      const placeholder = TRAVELERS[idx] ?? `Traveler ${idx + 1}`;
      this.nameMap.set(name, placeholder);
    }
  }

  knownNames(): string[] {
    // Sort longest-first so multi-word names don't get broken by single-token matches.
    return [...this.knownNamesSet].sort((a, b) => b.length - a.length);
  }

  nameFor(real: string): string {
    return this.nameMap.get(real) ?? real;
  }

  pnr(value: string): string {
    let v = this.pnrMap.get(value);
    if (v) return v;
    v = PNR_POOL[this.pnrMap.size] ?? deterministicAlpha(value, 6);
    this.pnrMap.set(value, v);
    return v;
  }

  numericId(value: string): string {
    let v = this.numericMap.get(value);
    if (v) return v;
    v = deterministicDigits(value, value.length);
    this.numericMap.set(value, v);
    return v;
  }

  hyphenatedId(value: string): string {
    let v = this.hyphenatedMap.get(value);
    if (v) return v;
    v = value
      .split('-')
      .map((part, i) => deterministicDigits(`${value}:${i}`, part.length))
      .join('-');
    this.hyphenatedMap.set(value, v);
    return v;
  }

  mixedId(value: string): string {
    let v = this.mixedMap.get(value);
    if (v) return v;
    // Preserve casing pattern: uppercase letter → uppercase replacement; lowercase → lowercase;
    // digit → digit. Replacement chars come from a deterministic hash so collisions stay stable.
    v = deterministicMixed(value);
    this.mixedMap.set(value, v);
    return v;
  }

  shortMixed(value: string): string {
    let v = this.shortMap.get(value);
    if (v) return v;
    v = deterministicMixed(value);
    this.shortMap.set(value, v);
    return v;
  }
}

function deterministicMixed(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const ALPHA_UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const ALPHA_LO = 'abcdefghijklmnopqrstuvwxyz';
  const DIGITS = '0123456789';
  const out: string[] = [];
  for (let i = 0; i < seed.length; i++) {
    const c = seed[i] ?? '';
    const slice = hex.slice((i * 2) % (hex.length - 2), ((i * 2) % (hex.length - 2)) + 2);
    const n = parseInt(slice || '0', 16);
    if (/[A-Z]/.test(c)) out.push(ALPHA_UP[n % 26] ?? 'A');
    else if (/[a-z]/.test(c)) out.push(ALPHA_LO[n % 26] ?? 'a');
    else if (/\d/.test(c)) out.push(DIGITS[n % 10] ?? '0');
    else out.push(c);
  }
  return out.join('');
}

function deterministicDigits(seed: string, len: number): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const bigNum = BigInt('0x' + hex);
  const s = bigNum.toString().padStart(len, '0');
  return s.slice(s.length - len);
}

function deterministicAlpha(seed: string, len: number): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const slice = hex.slice(i * 2, i * 2 + 2);
    const n = parseInt(slice || '0', 16);
    const idx = ALPHA.charCodeAt(n % ALPHA.length) - 65;
    out.push(ALPHA[idx] ?? 'A');
  }
  return out.join('');
}

// Detect first names in confirmation strings: tokens of length ≥3 that are TitleCase and
// not in a known-airline/known-place blocklist. Conservative — better to miss a few than
// over-substitute hotel names.
function extractNames(confirmation: string): string[] {
  const out: string[] = [];
  // Pattern: "Trip 1 (PNR): Name1, Name2 | ..." or "Adults 2, Children 2"
  // We only treat tokens after a "(PNR):" or directly after a colon as candidate names.
  const candidatesBlocks = confirmation.match(/[:\\)]\s*([A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)+)/g) ?? [];
  for (const block of candidatesBlocks) {
    const names = block.replace(/^[:\\)\s]+/, '').split(/[,|]\s*|\s+\|\s*/);
    for (const raw of names) {
      const n = raw.trim();
      if (!n) continue;
      if (/^(Adults|Children|Pay|Room|Pax|Standard|Twin|Forest|Junior)$/i.test(n)) continue;
      if (n.length < 3) continue;
      if (!/^[A-Z][a-z]+$/.test(n.split(/\s+/)[0] ?? '')) continue;
      out.push(n);
    }
  }
  return out;
}

function scrubDay(day: Day, ctx: ScrubContext): Day {
  if (day.confirmation) {
    for (const n of extractNames(day.confirmation)) ctx.registerName(n);
  }
  const out: Day = { ...day };
  if (out.details) out.details = scrubText(out.details, ctx);
  if (out.confirmation) {
    // confirmation is the highest-risk field — apply aggressive mode (catches short lowercase
    // alphanumeric refs that we wouldn't risk in free-text details).
    const scrubbed = scrubText(out.confirmation, ctx, { aggressive: true });
    out.confirmation = scrubbed.replace(/Room \d+,\s*/gi, '').trim();
  }
  if (out.subEvents) {
    out.subEvents = out.subEvents.map((e) => ({
      ...e,
      detail: e.detail ? scrubText(e.detail, ctx) : e.detail,
    }));
  }
  return out;
}

export function scrub(input: Day[]): Day[] {
  const ctx = new ScrubContext();
  // Two-pass: register all names first so substitution is consistent across days.
  for (const d of input) {
    if (d.confirmation) for (const n of extractNames(d.confirmation)) ctx.registerName(n);
  }
  return input.map((d) => scrubDay(d, ctx));
}

function loadJson(p: string): Day[] {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as Day[];
}

function writeJson(p: string, data: unknown): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes('--check');

  if (!fs.existsSync(PRIVATE)) {
    if (check) {
      // In CI / clones without the private file, --check is a no-op.
      console.log(
        '[scrub] no private file at',
        path.relative(ROOT, PRIVATE),
        '; --check no-op.',
      );
      return;
    }
    console.error('No private file at', PRIVATE);
    console.error(
      'Place the raw ITINERARY snapshot at seed/japan-2026.private.json before running scrub.',
    );
    process.exit(1);
  }

  const input = loadJson(PRIVATE);
  const scrubbed = scrub(input);

  if (check) {
    if (!fs.existsSync(PUBLIC)) {
      console.error('Public snapshot missing; run `pnpm scrub` to generate it.');
      process.exit(1);
    }
    const have = fs.readFileSync(PUBLIC, 'utf8');
    const want = JSON.stringify(scrubbed, null, 2) + '\n';
    if (have !== want) {
      console.error('Public snapshot is stale. Run `pnpm scrub` to regenerate.');
      process.exit(1);
    }
    console.log('[scrub] public snapshot up to date.');
    return;
  }

  writeJson(PUBLIC, scrubbed);
  console.log('[scrub] wrote', path.relative(ROOT, PUBLIC), `(${scrubbed.length} days)`);
}

if (require.main === module) main();
