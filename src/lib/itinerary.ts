/**
 * Itinerary derivations ported from japan-2026/js (getCityGroups, getTransitPairs).
 *
 * The original operated on a hand-authored day array. Trip-os has Reservation rows + a
 * Location table, so these helpers adapt to that shape: a day is an ISO date in the
 * trip's home timezone, paired with the reservations that intersect it and an optional
 * "city" hint derived from lodging.
 */

import { dateInZone } from '@/lib/time';
import type { Location } from '@/domain/location';
import type { Reservation } from '@/domain/reservation';

export interface ItineraryDay {
  /** yyyy-mm-dd in the trip's home timezone. */
  date: string;
  /** Reservations whose interval intersects this day. */
  reservations: Reservation[];
  /** Lodging row covering the night of this day, if any (used to derive `city`). */
  lodging?: Reservation;
  /** Best-effort city name for this day. "Travel" when no lodging context applies. */
  city: string;
}

export interface CityGroup {
  city: string;
  /** URL-safe slug. Deduplicated across groups via `-2`, `-3` suffixes. */
  slug: string;
  days: ItineraryDay[];
}

export interface TransitPair {
  from: string;
  to: string;
  /** Geocode query strings used to build Maps URLs. */
  fromQuery: string;
  toQuery: string;
}

/**
 * Group consecutive days that share a city into a single CityGroup. Mirrors the
 * japan-2026 behavior where two stretches in the same city get separate groups (slug suffix).
 */
export function getCityGroups(days: ItineraryDay[]): CityGroup[] {
  const groups: CityGroup[] = [];
  let current: CityGroup | null = null;
  for (const day of days) {
    const norm = day.city || 'Travel';
    if (!current || current.city !== norm) {
      current = { city: norm, slug: '', days: [day] };
      groups.push(current);
    } else {
      current.days.push(day);
    }
  }
  const slugCounts: Record<string, number> = {};
  for (const g of groups) {
    const base = g.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'travel';
    slugCounts[base] = (slugCounts[base] ?? 0) + 1;
    g.slug = slugCounts[base] > 1 ? `${base}-${slugCounts[base]}` : base;
  }
  return groups;
}

/**
 * Given an ordered list of reservations for a day (sorted by start_at) and the previous
 * day's last location, emit transit pairs between consecutive distinct locations.
 *
 * Pairs cover the inter-day hop (yesterday's hotel → today's first stop) when distinct,
 * plus same-day hops between consecutive distinct locations.
 */
export function getTransitPairs(
  todays: Reservation[],
  locationsById: Map<string, Location>,
  previousAnchor?: { name: string; query: string },
): TransitPair[] {
  const pairs: TransitPair[] = [];

  // Pull every distinct (name, query) pair touched during the day, in order.
  type Stop = { name: string; query: string };
  const stops: Stop[] = [];
  const pushStop = (locId: string | null | undefined, fallbackName: string): void => {
    if (!locId) return;
    const loc = locationsById.get(locId);
    if (!loc) return;
    const stop = { name: loc.name || fallbackName, query: loc.geocode_query };
    const last = stops[stops.length - 1];
    if (!last || last.query !== stop.query) stops.push(stop);
  };

  for (const r of todays) {
    pushStop(r.start_location_id, r.title);
    pushStop(r.end_location_id, r.title);
  }

  if (previousAnchor && stops.length > 0) {
    const first = stops[0];
    if (first && previousAnchor.query !== first.query) {
      pairs.push({
        from: previousAnchor.name,
        to: first.name,
        fromQuery: previousAnchor.query,
        toQuery: first.query,
      });
    }
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (!a || !b) continue;
    pairs.push({ from: a.name, to: b.name, fromQuery: a.query, toQuery: b.query });
  }

  return pairs;
}

/**
 * Enumerate yyyy-mm-dd dates from start..end inclusive in the given IANA zone. Naive
 * loop in UTC works because we treat the input as date-only strings; trip dates are
 * intended in the home zone.
 */
export function enumerateDays(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let d = start; d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Build ItineraryDay[] for a trip. For each day, gather reservations whose interval
 * intersects the day in the trip's home zone, find any lodging covering the night
 * (its check-in ≤ day < check-out), and derive a city label.
 *
 * Day reservations are sorted by start_at so downstream derivations (deriveCity,
 * transit pairs, the timeline UI) are deterministic regardless of DB row order —
 * on a checkout/check-in changeover day the covering-night lodging wins, and any
 * fallback walks reservations in chronological order.
 */
export function buildItineraryDays(
  startDate: string,
  endDate: string,
  reservations: Reservation[],
  homeTimezone: string,
  locationsById: Map<string, Location>,
): ItineraryDay[] {
  const dates = enumerateDays(startDate, endDate);
  return dates.map((date) => {
    const onDay = reservations
      .filter((r) => {
        const startDay = dateInZone(r.start_at, homeTimezone);
        const endDay = r.end_at ? dateInZone(r.end_at, homeTimezone) : startDay;
        return date >= startDay && date <= endDay;
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
    // Prefer the lodging covering the *night* of this day (check-in ≤ day < check-out)
    // so a changeover day resolves to where you sleep, not where you woke up. Fall back
    // to the earliest intersecting lodging (checkout-morning days) for the label only.
    const lodging =
      onDay.find((r) => r.type === 'lodging' && coversNight(r, date, homeTimezone)) ??
      onDay.find((r) => r.type === 'lodging');
    const city = deriveCity(lodging, onDay, locationsById);
    return { date, reservations: onDay, lodging, city };
  });
}

/** True when the lodging's check-in ≤ isoDate < check-out in the home zone. */
function coversNight(lodging: Reservation, isoDate: string, homeTimezone: string): boolean {
  const startDay = dateInZone(lodging.start_at, homeTimezone);
  const endDay = lodging.end_at ? dateInZone(lodging.end_at, homeTimezone) : startDay;
  return isoDate >= startDay && isoDate < endDay;
}

function deriveCity(
  lodging: Reservation | undefined,
  todays: Reservation[],
  locationsById: Map<string, Location>,
): string {
  if (lodging) {
    const locId = lodging.start_location_id ?? lodging.end_location_id;
    const fromLoc = locId ? locationsById.get(locId) : undefined;
    if (fromLoc) {
      const city = cityFromQuery(fromLoc.geocode_query);
      if (city) return city;
    }
    if (lodging.type === 'lodging') return lodging.details.property_name;
  }
  for (const r of todays) {
    const id = r.start_location_id ?? r.end_location_id;
    if (!id) continue;
    const loc = locationsById.get(id);
    if (!loc) continue;
    const city = cityFromQuery(loc.geocode_query);
    if (city) return city;
  }
  return 'Travel';
}

/**
 * Extract the "city" token from a geocode_query, mirroring japan-2026's getLocationQuery.
 * Inputs look like "Property, City, Country" (3 parts) or "Property, Ward, City, Region,
 * Country" (5 parts). For ≥ 4 parts, the city sits 3 from the end. For exactly 3 parts,
 * the middle segment is the city.
 */
function cityFromQuery(query: string): string | null {
  const parts = query.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 4) return parts[parts.length - 3] ?? null;
  if (parts.length === 3) return parts[1] ?? null;
  if (parts.length === 2) return parts[1] ?? null;
  return parts[0] ?? null;
}

/**
 * Compute the multi-night "night N of M" label for a lodging row on a given day.
 * Returns null if the lodging doesn't span the day or only covers a single night.
 */
export function nightOfM(
  lodging: Reservation,
  isoDate: string,
  homeTimezone: string,
): { n: number; m: number } | null {
  if (lodging.type !== 'lodging') return null;
  const startDay = dateInZone(lodging.start_at, homeTimezone);
  const endDay = lodging.end_at ? dateInZone(lodging.end_at, homeTimezone) : startDay;
  if (isoDate < startDay || isoDate >= endDay) return null;
  const start = new Date(`${startDay}T00:00:00Z`).getTime();
  const end = new Date(`${endDay}T00:00:00Z`).getTime();
  const day = new Date(`${isoDate}T00:00:00Z`).getTime();
  const m = Math.max(1, Math.round((end - start) / 86_400_000));
  const n = Math.max(1, Math.round((day - start) / 86_400_000) + 1);
  return { n, m };
}

export function appleMapsDirectionsUrl(fromQuery: string, toQuery: string): string {
  return `maps://?saddr=${encodeURIComponent(fromQuery)}&daddr=${encodeURIComponent(toQuery)}`;
}

export function googleMapsDirectionsUrl(fromQuery: string, toQuery: string): string {
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromQuery)}` +
    `&destination=${encodeURIComponent(toQuery)}&travelmode=transit`
  );
}
