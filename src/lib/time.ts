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
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone }));
  const diffMin = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sign = diffMin >= 0 ? '+' : '-';
  const abs = Math.abs(diffMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
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
