export interface TripDestination {
  /** Display name, e.g. "Anaheim, California". */
  name: string;
  timezone: string;
}

const DESTINATIONS: TripDestination[] = [
  { name: 'Anaheim, California', timezone: 'America/Los_Angeles' },
  { name: 'Los Angeles, California', timezone: 'America/Los_Angeles' },
  { name: 'San Francisco, California', timezone: 'America/Los_Angeles' },
  { name: 'San Diego, California', timezone: 'America/Los_Angeles' },
  { name: 'Las Vegas, Nevada', timezone: 'America/Los_Angeles' },
  { name: 'Seattle, Washington', timezone: 'America/Los_Angeles' },
  { name: 'Portland, Oregon', timezone: 'America/Los_Angeles' },
  { name: 'Denver, Colorado', timezone: 'America/Denver' },
  { name: 'Phoenix, Arizona', timezone: 'America/Phoenix' },
  { name: 'Chicago, Illinois', timezone: 'America/Chicago' },
  { name: 'New York, New York', timezone: 'America/New_York' },
  { name: 'Boston, Massachusetts', timezone: 'America/New_York' },
  { name: 'Miami, Florida', timezone: 'America/New_York' },
  { name: 'Orlando, Florida', timezone: 'America/New_York' },
  { name: 'Washington, D.C.', timezone: 'America/New_York' },
  { name: 'Toronto, Ontario', timezone: 'America/Toronto' },
  { name: 'Vancouver, British Columbia', timezone: 'America/Los_Angeles' },
  { name: 'Mexico City, Mexico', timezone: 'America/Mexico_City' },
  { name: 'London, United Kingdom', timezone: 'Europe/London' },
  { name: 'Paris, France', timezone: 'Europe/Paris' },
  { name: 'Berlin, Germany', timezone: 'Europe/Berlin' },
  { name: 'Rome, Italy', timezone: 'Europe/Rome' },
  { name: 'Madrid, Spain', timezone: 'Europe/Madrid' },
  { name: 'Barcelona, Spain', timezone: 'Europe/Madrid' },
  { name: 'Amsterdam, Netherlands', timezone: 'Europe/Paris' },
  { name: 'Cairo, Egypt', timezone: 'Africa/Cairo' },
  { name: 'Dubai, United Arab Emirates', timezone: 'Asia/Dubai' },
  { name: 'Bangkok, Thailand', timezone: 'Asia/Bangkok' },
  { name: 'Singapore', timezone: 'Asia/Singapore' },
  { name: 'Tokyo, Japan', timezone: 'Asia/Tokyo' },
  { name: 'Kyoto, Japan', timezone: 'Asia/Tokyo' },
  { name: 'Seoul, South Korea', timezone: 'Asia/Tokyo' },
  { name: 'Hong Kong', timezone: 'Asia/Tokyo' },
  { name: 'Sydney, Australia', timezone: 'Australia/Sydney' },
  { name: 'Melbourne, Australia', timezone: 'Australia/Sydney' },
  { name: 'Auckland, New Zealand', timezone: 'Pacific/Auckland' },
  { name: 'Honolulu, Hawaii', timezone: 'Pacific/Honolulu' },
  { name: 'São Paulo, Brazil', timezone: 'America/Sao_Paulo' },
  { name: 'Buenos Aires, Argentina', timezone: 'America/Sao_Paulo' },
];

/** Offline-first destination search for trip titles. */
export function searchTripDestinations(query: string, limit = 6): TripDestination[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const matches = DESTINATIONS.filter((d) => d.name.toLowerCase().includes(q));
  return matches.slice(0, limit);
}
