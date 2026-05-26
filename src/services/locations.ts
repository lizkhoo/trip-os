import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { locations } from '@/db/schema';
import { LocationInputSchema, type Location, type LocationInput } from '@/domain/location';
import { newUuid } from '@/lib/uuid';

function toDomain(row: typeof locations.$inferSelect): Location {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    geocode_query: row.geocodeQuery,
    place_id: row.placeId,
    timezone: row.timezone,
  };
}

export async function createLocation(input: LocationInput): Promise<Location> {
  const parsed = LocationInputSchema.parse(input);
  const id = newUuid();
  await db.insert(locations).values({
    id,
    name: parsed.name,
    address: parsed.address ?? null,
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
    geocodeQuery: parsed.geocode_query,
    placeId: parsed.place_id ?? null,
    timezone: parsed.timezone,
  });
  return { id, ...parsed };
}

export async function findLocationByQuery(geocodeQuery: string): Promise<Location | undefined> {
  const row = await db
    .select()
    .from(locations)
    .where(eq(locations.geocodeQuery, geocodeQuery))
    .get();
  return row ? toDomain(row) : undefined;
}

export async function findOrCreateLocation(input: LocationInput): Promise<Location> {
  const existing = await findLocationByQuery(input.geocode_query);
  if (existing) return existing;
  return createLocation(input);
}

export async function getLocation(id: string): Promise<Location | undefined> {
  const row = await db.select().from(locations).where(eq(locations.id, id)).get();
  return row ? toDomain(row) : undefined;
}

export async function listLocationsByIds(ids: string[]): Promise<Location[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(locations).where(inArray(locations.id, ids));
  return rows.map(toDomain);
}
