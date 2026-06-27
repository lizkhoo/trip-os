/**
 * Transform seed/japan-2026.json (day-keyed itinerary) → trips + reservations + locations.
 *
 * Loads the private file first if present, falling back to the scrubbed public file.
 * Idempotent: deletes the prior "Japan 2026" trip before inserting (deletes cascade via FK).
 *
 * Two entry points:
 *   - `runSeed()` exported for the dev screen to call on-device.
 *   - `tsx scripts/seed.ts` runs against a Node-side in-memory better-sqlite3 (used by smoke.ts).
 */
import { composeIso } from '@/lib/time';
import type { ReservationInput } from '@/domain/reservation';
// Imported as a module (not fs-read) so this file bundles under React Native too —
// the app's dev screen calls runSeed() on-device. Node (smoke/e2e) resolves the
// JSON import the same way. The committed file is the scrubbed/public fixture.
import seedDaysJson from '../seed/japan-2026.json';

const TRIP_TITLE = 'Japan 2026';
const TRIP_TZ = 'Asia/Tokyo';
const ORIGIN_TZ = 'America/Los_Angeles';

type SubEvent = { time?: string; name?: string; detail?: string };
type Link = { name?: string; url?: string; map?: string };
export type SeedDay = {
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

const DINING_KEYWORDS = [
  'restaurant',
  'mickey',
  'coffeehouse',
  'cafe',
  'café',
  'grill',
  'pizza',
  'italia',
  'mamma',
  'horizon bay',
];

export interface SeedSummary {
  trip: string;
  reservations: number;
  locations: number;
}

export interface SeedDeps {
  createTrip: (input: {
    title: string;
    start_date: string;
    end_date: string;
    home_timezone: string;
  }) => Promise<{ id: string }>;
  findTripByTitle: (title: string) => Promise<{ id: string } | undefined>;
  deleteTrip: (id: string) => Promise<void>;
  findOrCreateLocation: (input: {
    name: string;
    geocode_query: string;
    timezone: string;
  }) => Promise<{ id: string }>;
  createReservation: (input: ReservationInput) => Promise<{ id: string }>;
}

function loadDays(): SeedDay[] {
  return seedDaysJson as unknown as SeedDay[];
}

function parseTime(timeStr: string | undefined): string | null {
  if (!timeStr) return null;
  // Accept "9:02 AM", "12:25", "15:30", "5:30 PM"
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let hh = parseInt(m[1] ?? '0', 10);
  const mm = m[2] ?? '00';
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

function inferFlightTimezone(flightName: string): string {
  // Heuristic for the seed: legs landing in / departing from Japan use Asia/Tokyo; others LA.
  const jp = /\b(NRT|HND|KIX|ITM|FUK|CTS|OKA)\b/i;
  return jp.test(flightName) ? TRIP_TZ : ORIGIN_TZ;
}

function classifySubEvent(name: string): 'flight' | 'dining' | 'activity' | 'transit' {
  if (/^[A-Z]{2}\s?\d+/.test(name)) return 'flight';
  const lower = name.toLowerCase();
  if (DINING_KEYWORDS.some((k) => lower.includes(k))) return 'dining';
  return 'activity';
}

function flightCarrierAndNumber(name: string): { carrier: string; flight_number: string } {
  const m = name.match(/^([A-Z]{2})\s?(\d+)/);
  return {
    carrier: m?.[1] ?? 'XX',
    flight_number: m?.[2] ?? '0',
  };
}

function flightIatas(name: string): { depart?: string; arrive?: string } {
  const m = name.match(/([A-Z]{3})\s*(?:→|->|to)\s*([A-Z]{3})/i);
  return { depart: m?.[1], arrive: m?.[2] };
}

interface BuiltContext {
  tripId: string;
  locations: Map<string, string>; // geocodeQuery → location id
  deps: SeedDeps;
}

async function getOrMakeLocation(
  ctx: BuiltContext,
  name: string,
  geocodeQuery: string,
): Promise<string> {
  const cached = ctx.locations.get(geocodeQuery);
  if (cached) return cached;
  const loc = await ctx.deps.findOrCreateLocation({
    name,
    geocode_query: geocodeQuery,
    timezone: TRIP_TZ,
  });
  ctx.locations.set(geocodeQuery, loc.id);
  return loc.id;
}

async function ingestSubEvent(
  ctx: BuiltContext,
  day: SeedDay,
  sub: SubEvent,
): Promise<void> {
  if (!sub.name || !sub.time) return;
  const time = parseTime(sub.time);
  if (!time) return;
  const kind = classifySubEvent(sub.name);

  if (kind === 'flight') {
    const tz = inferFlightTimezone(sub.name);
    const { carrier, flight_number } = flightCarrierAndNumber(sub.name);
    const { depart, arrive } = flightIatas(sub.name);
    await ctx.deps.createReservation({
      trip_id: ctx.tripId,
      type: 'flight',
      title: sub.name,
      start_at: composeIso(day.date, time, tz),
      end_at: null,
      start_location_id: null,
      end_location_id: null,
      confirmation_code: null,
      source: 'manual',
      source_ref: null,
      confidence: null,
      status: 'confirmed',
      details: {
        carrier,
        flight_number,
        depart_iata: depart,
        arrive_iata: arrive,
        iana_timezone: tz,
      },
    });
    return;
  }

  if (kind === 'dining') {
    const link = (day.links ?? []).find((l) => l.name && sub.name?.includes(l.name));
    const locationId = link?.map
      ? await getOrMakeLocation(ctx, link.name ?? sub.name, link.map)
      : null;
    await ctx.deps.createReservation({
      trip_id: ctx.tripId,
      type: 'dining',
      title: sub.name,
      start_at: composeIso(day.date, time, TRIP_TZ),
      end_at: null,
      start_location_id: locationId,
      end_location_id: null,
      confirmation_code: null,
      source: 'manual',
      source_ref: null,
      confidence: null,
      status: 'confirmed',
      details: { iana_timezone: TRIP_TZ },
    });
    return;
  }

  // activity
  const link = (day.links ?? []).find((l) => l.name && sub.name?.includes(l.name));
  const locationId = link?.map
    ? await getOrMakeLocation(ctx, link.name ?? sub.name, link.map)
    : null;
  await ctx.deps.createReservation({
    trip_id: ctx.tripId,
    type: 'activity',
    title: sub.name,
    start_at: composeIso(day.date, time, TRIP_TZ),
    end_at: null,
    start_location_id: locationId,
    end_location_id: null,
    confirmation_code: null,
    source: 'manual',
    source_ref: null,
    confidence: null,
    status: 'confirmed',
    details: { iana_timezone: TRIP_TZ },
  });
}

async function ingestLodgingRuns(ctx: BuiltContext, days: SeedDay[]): Promise<void> {
  let i = 0;
  while (i < days.length) {
    const day = days[i];
    if (!day || !day.hotel) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && days[j + 1]?.hotel === day.hotel) j += 1;
    const checkIn = composeIso(day.date, '15:00', TRIP_TZ);
    const lastDay = days[j];
    if (lastDay) {
      // Checkout: day after last, 11:00.
      const next = new Date(lastDay.date + 'T00:00:00Z');
      next.setUTCDate(next.getUTCDate() + 1);
      const checkoutDate = next.toISOString().slice(0, 10);
      const link = (day.links ?? []).find(
        (l) => l.name && day.hotel && day.hotel.toLowerCase().includes(l.name.toLowerCase().split(' ').slice(0, 2).join(' ')),
      );
      const locationId = link?.map
        ? await getOrMakeLocation(ctx, link.name ?? day.hotel, link.map)
        : null;
      await ctx.deps.createReservation({
        trip_id: ctx.tripId,
        type: 'lodging',
        title: day.hotel,
        start_at: checkIn,
        end_at: composeIso(checkoutDate, '11:00', TRIP_TZ),
        start_location_id: locationId,
        end_location_id: locationId,
        confirmation_code: lastDay.confirmation ?? day.confirmation ?? null,
        source: 'manual',
        source_ref: null,
        confidence: null,
        status: 'confirmed',
        details: {
          property_name: day.hotel,
          nights: j - i + 1,
          iana_timezone: TRIP_TZ,
        },
      });
    }
    i = j + 1;
  }
}

async function ingestTransitPlaceholders(ctx: BuiltContext, days: SeedDay[]): Promise<void> {
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!d) continue;
    if (!/^Travel to /.test(d.event)) continue;
    const hasFlightToday = (d.subEvents ?? []).some(
      (s) => s.name && /^[A-Z]{2}\s?\d+/.test(s.name),
    );
    if (hasFlightToday) continue;
    const prev = i > 0 ? days[i - 1] : undefined;
    const from = prev?.hotel || prev?.city || 'Unknown origin';
    const to = d.hotel || d.city || 'Unknown destination';
    await ctx.deps.createReservation({
      trip_id: ctx.tripId,
      type: 'transit',
      title: `${from} → ${to}`,
      start_at: composeIso(d.date, parseTime(d.time) ?? '09:00', TRIP_TZ),
      end_at: null,
      start_location_id: null,
      end_location_id: null,
      confirmation_code: null,
      source: 'manual',
      source_ref: null,
      confidence: null,
      status: 'confirmed',
      details: {
        operator: 'unknown',
        mode: 'train',
        departure_station: from,
        arrival_station: to,
        iana_timezone: TRIP_TZ,
      },
    });
  }
}

export async function runSeedWithDeps(deps: SeedDeps): Promise<SeedSummary> {
  const days = loadDays();
  if (days.length === 0) throw new Error('seed: empty itinerary');

  const startDate = days[0]?.date ?? '';
  const endDate = days[days.length - 1]?.date ?? '';

  const existing = await deps.findTripByTitle(TRIP_TITLE);
  if (existing) await deps.deleteTrip(existing.id);

  const trip = await deps.createTrip({
    title: TRIP_TITLE,
    start_date: startDate,
    end_date: endDate,
    home_timezone: TRIP_TZ,
  });

  const ctx: BuiltContext = { tripId: trip.id, locations: new Map(), deps };

  // Pre-create locations from all distinct link.map strings so transit pairs can later reference them.
  for (const d of days) {
    for (const link of d.links ?? []) {
      if (link.map) await getOrMakeLocation(ctx, link.name ?? link.map, link.map);
    }
  }

  let reservationCount = 0;
  const wrappedCreate = ctx.deps.createReservation;
  ctx.deps = {
    ...ctx.deps,
    createReservation: async (input) => {
      const r = await wrappedCreate(input);
      reservationCount += 1;
      return r;
    },
  };

  // Atomic seed: if any reservation fails (e.g. a timestamp that won't validate),
  // delete the trip we just created so its FK-cascade removes every partial row —
  // a failure must never leave a "Japan 2026" trip with zero/partial reservations.
  try {
    await ingestLodgingRuns(ctx, days);
    for (const d of days) {
      for (const sub of d.subEvents ?? []) {
        await ingestSubEvent(ctx, d, sub);
      }
    }
    await ingestTransitPlaceholders(ctx, days);
  } catch (err) {
    await deps.deleteTrip(trip.id);
    throw err;
  }

  return {
    trip: trip.id,
    reservations: reservationCount,
    locations: ctx.locations.size,
  };
}

/**
 * Runs the seed against the on-device Drizzle services (the default for the dev screen).
 */
export async function runSeed(): Promise<SeedSummary> {
  const trips = await import('@/services/trips');
  const reservations = await import('@/services/reservations');
  const locations = await import('@/services/locations');
  return runSeedWithDeps({
    createTrip: (i) =>
      trips.createTrip(i).then((t) => ({ id: t.id })),
    findTripByTitle: (title) => trips.findTripByTitle(title),
    deleteTrip: trips.deleteTrip,
    findOrCreateLocation: (i) =>
      locations.findOrCreateLocation(i).then((l) => ({ id: l.id })),
    createReservation: (i) =>
      reservations.createReservation(i).then((r) => ({ id: r.id })),
  });
}

