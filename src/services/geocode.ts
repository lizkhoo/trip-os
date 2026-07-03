import { eq, isNull, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { locations } from '@/db/schema';

/**
 * Geocoding boundary. Production `geocodeQuery` resolves a location's
 * geocode_query string to lat/lng via expo-location's geocodeAsync, which is
 * backed by Apple's CLGeocoder on iOS — on-device, free, no API key. The e2e
 * harness injects deterministic coordinates through the test hatch (same shape
 * as ocr.ts / extract.ts hatches).
 */

export interface GeocodeHit {
  lat: number;
  lng: number;
}

// Deferred so importing this module under Node (e2e runner / smoke) never loads
// expo-location's native bridge. Mirrors ocr.ts / storage.ts deferral.
async function loadExpoLocation(): Promise<typeof import('expo-location')> {
  return import('expo-location');
}

export async function geocodeQuery(query: string): Promise<GeocodeHit | null> {
  const Location = await loadExpoLocation();
  const results = await Location.geocodeAsync(query);
  const first = results[0];
  if (!first) return null;
  return { lat: first.latitude, lng: first.longitude };
}

export interface GeocodeBackfillResult {
  attempted: number;
  resolved: number;
}

/**
 * Resolve coordinates for every location that doesn't have them yet, storing
 * lat/lng back on the row. Runs sequentially — CLGeocoder throttles bursts —
 * and keeps going past individual failures (a location that can't be geocoded
 * stays lat/lng-null and the map falls back to its Maps-URL search link).
 */
export async function geocodeMissingLocations(): Promise<GeocodeBackfillResult> {
  const rows = await getDb()
    .select()
    .from(locations)
    .where(or(isNull(locations.lat), isNull(locations.lng)));

  let resolved = 0;
  for (const row of rows) {
    let hit: GeocodeHit | null = null;
    try {
      hit = await geocodeQueryViaHatch(row.geocodeQuery);
    } catch {
      continue;
    }
    if (!hit) continue;
    await getDb()
      .update(locations)
      .set({ lat: hit.lat, lng: hit.lng })
      .where(eq(locations.id, row.id));
    resolved += 1;
  }
  return { attempted: rows.length, resolved };
}

// --- Test hatch -----------------------------------------------------------------
// Lets the e2e harness substitute deterministic coordinates without
// expo-location. Production code paths call geocodeQueryViaHatch so tests can
// inject.
type GeocodeFn = (query: string) => Promise<GeocodeHit | null>;
let testOverride: GeocodeFn | null = null;

export function __setGeocodeForTest(fn: GeocodeFn | null): void {
  testOverride = fn;
}

export async function geocodeQueryViaHatch(query: string): Promise<GeocodeHit | null> {
  return (testOverride ?? geocodeQuery)(query);
}
