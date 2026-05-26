import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips } from '@/db/schema';
import { TripInputSchema, type Trip, type TripInput } from '@/domain/trip';
import { newUuid } from '@/lib/uuid';

export async function createTrip(input: TripInput): Promise<Trip> {
  const parsed = TripInputSchema.parse(input);
  const id = newUuid();
  await db.insert(trips).values({
    id,
    title: parsed.title,
    startDate: parsed.start_date,
    endDate: parsed.end_date,
    homeTimezone: parsed.home_timezone,
    coverImageUri: parsed.cover_image_uri ?? null,
  });
  return { id, ...parsed };
}

export async function listTrips(): Promise<Trip[]> {
  const rows = await db.select().from(trips);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    start_date: r.startDate,
    end_date: r.endDate,
    home_timezone: r.homeTimezone,
    cover_image_uri: r.coverImageUri,
  }));
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  const row = await db.select().from(trips).where(eq(trips.id, id)).get();
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    start_date: row.startDate,
    end_date: row.endDate,
    home_timezone: row.homeTimezone,
    cover_image_uri: row.coverImageUri,
  };
}

export async function deleteTrip(id: string): Promise<void> {
  await db.delete(trips).where(eq(trips.id, id));
}

export async function findTripByTitle(title: string): Promise<Trip | undefined> {
  const row = await db.select().from(trips).where(eq(trips.title, title)).get();
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    start_date: row.startDate,
    end_date: row.endDate,
    home_timezone: row.homeTimezone,
    cover_image_uri: row.coverImageUri,
  };
}
