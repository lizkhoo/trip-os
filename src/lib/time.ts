/**
 * Time helpers. The PRD requires every reservation timestamp to carry an explicit
 * IANA-zone-derived offset. We never accept bare-Z or zoneless strings — the offset
 * must be present so a later reader can reconstruct local time without separately
 * knowing the trip's home timezone.
 */

const ISO_OFFSET_RE = /[+-]\d{2}:?\d{2}$/;

export function assertHasOffset(iso: string): void {
  if (!ISO_OFFSET_RE.test(iso)) {
    throw new Error(
      `Timestamp must include an explicit ±HH:MM offset (got: ${iso}). Bare-Z is not accepted.`,
    );
  }
}

export function hasOffset(iso: string): boolean {
  return ISO_OFFSET_RE.test(iso);
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Format an ISO timestamp into a yyyy-mm-dd date string in the given IANA zone.
 * Used to group reservations by day in the trip's home timezone.
 */
export function dateInZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${y}-${m}-${day}`;
}

/**
 * Compute the IANA-zone offset (e.g. "+09:00") for a given UTC instant.
 * Useful when assembling an ISO string from a local date+time + IANA zone.
 */
export function offsetForZone(date: Date, timeZone: string): string {
  // Derive the offset from the formatted zone name rather than diffing two
  // `toLocaleString` round-trips: the latter is unreliable on Hermes (it depends
  // on Date being able to re-parse a localized string). `longOffset` yields
  // "GMT+09:00" / "GMT-7" / "GMT" (== UTC). Requires the Intl tz polyfill on
  // Hermes (see src/lib/intl-polyfill.ts); on Node's full ICU it works as-is.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return '+00:00';
  const sign = m[1];
  const hh = (m[2] ?? '0').padStart(2, '0');
  const mm = (m[3] ?? '00').padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/**
 * Build an ISO 8601 timestamp from a local date + time-of-day + IANA zone.
 * E.g. composeIso("2026-03-14", "09:02", "America/Los_Angeles") → "2026-03-14T09:02:00-07:00"
 */
export function composeIso(dateYmd: string, timeHm: string, timeZone: string): string {
  const [hh, mm] = timeHm.split(':');
  const probe = new Date(`${dateYmd}T${hh ?? '00'}:${mm ?? '00'}:00Z`);
  const offset = offsetForZone(probe, timeZone);
  return `${dateYmd}T${hh ?? '00'}:${mm ?? '00'}:00${offset}`;
}

/**
 * Read the wall-clock a `Date` shows in the DEVICE's local timezone.
 *
 * Native date/time pickers work in device-local time: when the user taps
 * "July 3", they get a Date whose *local* components are July 3. Anything that
 * re-derives the calendar date from the underlying instant in a different zone
 * (`dateInZone(d.toISOString(), tripTimezone)`) can land on a different day —
 * that is an off-by-one waiting to happen, in whichever direction the two zones
 * differ.
 *
 * So: take the digits the user actually saw, and let the caller's IANA zone
 * decide what those digits mean (see `composeIso`). These use core `Date`
 * getters, which are unaffected by the FormatJS Intl polyfill.
 */
export function localYmd(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Wall-clock "HH:MM" (24h) a `Date` shows in the device's local timezone. */
export function localHm(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Shift `d` so its UTC components equal its device-local components.
 *
 * For DISPLAY only. `Date.prototype.toLocale*` is replaced by
 * @formatjs/intl-datetimeformat/polyfill-force, which defaults to **UTC**
 * because `__setDefaultTimeZone` is never called (see src/lib/intl-polyfill.ts)
 * — so a bare `toLocaleDateString()` renders the UTC day, not the local one, and
 * shows tomorrow's date all evening for anyone west of Greenwich.
 *
 * Formatting this mirrored instant with an explicit `timeZone: 'UTC'` reproduces
 * the local wall-clock while keeping locale-aware formatting.
 */
export function localWallClockAsUtc(d: Date): Date {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
}

/**
 * Inverse of `localYmd`/`localHm`: build a Date whose DEVICE-LOCAL components
 * equal the wall-clock `iso` shows in `timeZone`.
 *
 * Used when loading a stored reservation into the pickers. `new Date(iso)` is
 * the right *instant* but the wrong *display*: a 09:02 Tokyo booking opened on a
 * device in Los Angeles renders as 17:02 the previous day. Since save takes the
 * picker's digits literally, loading the raw instant would rewrite the booking
 * to 17:02 Tokyo on the next save — a silent round-trip corruption.
 */
export function zonedWallClockAsLocalDate(iso: string, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 rather than hour12:false — the latter renders midnight as "24" under
    // some ICU builds, which would roll the date forward a day.
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), 0, 0);
}
