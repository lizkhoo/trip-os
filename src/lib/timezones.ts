import type { SelectOption } from '@/components/ui';

interface ZoneEntry {
  id: string;
  city: string;
  /** Abbreviation during standard time. */
  std: string;
  /** Abbreviation during daylight saving time; omit for zones without DST. */
  dst?: string;
}

// Curated list of common IANA zones — keeps trip create/edit usable without an
// exhaustive picker. Abbreviations are curated because CLDR "short" zone names
// outside the US render as "GMT+1" rather than CET/EET etc.
const ZONES: ZoneEntry[] = [
  { id: 'America/Los_Angeles', city: 'Los Angeles', std: 'PST', dst: 'PDT' },
  { id: 'America/Denver', city: 'Denver', std: 'MST', dst: 'MDT' },
  { id: 'America/Phoenix', city: 'Phoenix', std: 'MST' },
  { id: 'America/Chicago', city: 'Chicago', std: 'CST', dst: 'CDT' },
  { id: 'America/New_York', city: 'New York', std: 'EST', dst: 'EDT' },
  { id: 'America/Toronto', city: 'Toronto', std: 'EST', dst: 'EDT' },
  { id: 'America/Mexico_City', city: 'Mexico City', std: 'CST' },
  { id: 'America/Sao_Paulo', city: 'São Paulo', std: 'BRT' },
  { id: 'Europe/London', city: 'London', std: 'GMT', dst: 'BST' },
  { id: 'Europe/Paris', city: 'Paris', std: 'CET', dst: 'CEST' },
  { id: 'Europe/Berlin', city: 'Berlin', std: 'CET', dst: 'CEST' },
  { id: 'Europe/Madrid', city: 'Madrid', std: 'CET', dst: 'CEST' },
  { id: 'Europe/Rome', city: 'Rome', std: 'CET', dst: 'CEST' },
  { id: 'Africa/Cairo', city: 'Cairo', std: 'EET', dst: 'EEST' },
  { id: 'Asia/Dubai', city: 'Dubai', std: 'GST' },
  { id: 'Asia/Bangkok', city: 'Bangkok', std: 'ICT' },
  { id: 'Asia/Singapore', city: 'Singapore', std: 'SGT' },
  { id: 'Asia/Tokyo', city: 'Tokyo', std: 'JST' },
  { id: 'Australia/Sydney', city: 'Sydney', std: 'AEST', dst: 'AEDT' },
  { id: 'Pacific/Auckland', city: 'Auckland', std: 'NZST', dst: 'NZDT' },
];

/** Offset of `timeZone` from UTC in minutes at the given instant (DST-aware). */
export function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  // hour12:false can yield "24" at midnight in some ICU versions.
  const wallClockUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((wallClockUtc - at.getTime()) / 60_000);
}

function isDstActive(timeZone: string, at: Date): boolean {
  const jan = timezoneOffsetMinutes(timeZone, new Date(Date.UTC(at.getUTCFullYear(), 0, 1)));
  const jul = timezoneOffsetMinutes(timeZone, new Date(Date.UTC(at.getUTCFullYear(), 6, 1)));
  // Works in both hemispheres: DST is whichever offset exceeds the year's minimum.
  return timezoneOffsetMinutes(timeZone, at) > Math.min(jan, jul);
}

function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Options with DST-aware labels, e.g. "Paris (CEST, UTC+2)". Compute at render time. */
export function getTimezoneOptions(at: Date = new Date()): SelectOption[] {
  return ZONES.map(({ id, city, std, dst }) => {
    const abbr = dst && isDstActive(id, at) ? dst : std;
    const offset = formatUtcOffset(timezoneOffsetMinutes(id, at));
    return { value: id, label: `${city} (${abbr}, ${offset})` };
  });
}
