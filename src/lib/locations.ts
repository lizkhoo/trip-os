export interface TripLocation {
  /** Display name, e.g. "Anaheim, California". */
  label: string;
  /** IANA timezone id — must match an entry in src/lib/timezones.ts. */
  timezone: string;
}

// Offline-first curated destinations. Labels are what we pre-fill as the trip title.
const LOCATIONS: TripLocation[] = [
  { label: 'Anaheim, California', timezone: 'America/Los_Angeles' },
  { label: 'Los Angeles, California', timezone: 'America/Los_Angeles' },
  { label: 'San Francisco, California', timezone: 'America/Los_Angeles' },
  { label: 'San Diego, California', timezone: 'America/Los_Angeles' },
  { label: 'Seattle, Washington', timezone: 'America/Los_Angeles' },
  { label: 'Portland, Oregon', timezone: 'America/Los_Angeles' },
  { label: 'Las Vegas, Nevada', timezone: 'America/Los_Angeles' },
  { label: 'Denver, Colorado', timezone: 'America/Denver' },
  { label: 'Phoenix, Arizona', timezone: 'America/Phoenix' },
  { label: 'Chicago, Illinois', timezone: 'America/Chicago' },
  { label: 'New York, New York', timezone: 'America/New_York' },
  { label: 'Boston, Massachusetts', timezone: 'America/New_York' },
  { label: 'Miami, Florida', timezone: 'America/New_York' },
  { label: 'Washington, D.C.', timezone: 'America/New_York' },
  { label: 'Toronto, Ontario', timezone: 'America/Toronto' },
  { label: 'Vancouver, British Columbia', timezone: 'America/Los_Angeles' },
  { label: 'Mexico City, Mexico', timezone: 'America/Mexico_City' },
  { label: 'Cancún, Mexico', timezone: 'America/Mexico_City' },
  { label: 'São Paulo, Brazil', timezone: 'America/Sao_Paulo' },
  { label: 'Rio de Janeiro, Brazil', timezone: 'America/Sao_Paulo' },
  { label: 'London, England', timezone: 'Europe/London' },
  { label: 'Edinburgh, Scotland', timezone: 'Europe/London' },
  { label: 'Paris, France', timezone: 'Europe/Paris' },
  { label: 'Berlin, Germany', timezone: 'Europe/Berlin' },
  { label: 'Munich, Germany', timezone: 'Europe/Berlin' },
  { label: 'Madrid, Spain', timezone: 'Europe/Madrid' },
  { label: 'Barcelona, Spain', timezone: 'Europe/Madrid' },
  { label: 'Rome, Italy', timezone: 'Europe/Rome' },
  { label: 'Florence, Italy', timezone: 'Europe/Rome' },
  { label: 'Amsterdam, Netherlands', timezone: 'Europe/Paris' },
  { label: 'Cairo, Egypt', timezone: 'Africa/Cairo' },
  { label: 'Dubai, United Arab Emirates', timezone: 'Asia/Dubai' },
  { label: 'Bangkok, Thailand', timezone: 'Asia/Bangkok' },
  { label: 'Singapore', timezone: 'Asia/Singapore' },
  { label: 'Tokyo, Japan', timezone: 'Asia/Tokyo' },
  { label: 'Kyoto, Japan', timezone: 'Asia/Tokyo' },
  { label: 'Osaka, Japan', timezone: 'Asia/Tokyo' },
  { label: 'Seoul, South Korea', timezone: 'Asia/Tokyo' },
  { label: 'Sydney, Australia', timezone: 'Australia/Sydney' },
  { label: 'Melbourne, Australia', timezone: 'Australia/Sydney' },
  { label: 'Auckland, New Zealand', timezone: 'Pacific/Auckland' },
  { label: 'Queenstown, New Zealand', timezone: 'Pacific/Auckland' },
  { label: 'Honolulu, Hawaii', timezone: 'America/Los_Angeles' },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Return up to `limit` locations whose label matches the query (prefix or word-start). */
export function searchLocations(query: string, limit = 6): TripLocation[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];

  const scored: { loc: TripLocation; score: number }[] = [];
  for (const loc of LOCATIONS) {
    const label = normalize(loc.label);
    if (label.startsWith(q)) {
      scored.push({ loc, score: 0 });
      continue;
    }
    const words = label.split(/[\s,]+/);
    if (words.some((w) => w.startsWith(q))) {
      scored.push({ loc, score: 1 });
    } else if (label.includes(q)) {
      scored.push({ loc, score: 2 });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.loc.label.localeCompare(b.loc.label));
  return scored.slice(0, limit).map((s) => s.loc);
}
