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
