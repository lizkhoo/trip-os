import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trips } from '@/db/schema';
import { TripInputSchema, type Trip, type TripInput } from '@/domain/trip';
import { newUuid } from '@/lib/uuid';
import { dateInZone } from '@/lib/time';

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

/**
 * Single-trip-match auto-assign. Returns the trip id when `startAt` (an ISO 8601 timestamp
 * with offset) falls inside exactly one trip's [start_date, end_date] range, interpreted
 * in that trip's home timezone. Zero or multiple matches → null — matches the "needs trip"
 * inbox rule from the PRD. Shared by syncUpload and (TODO once Agent 2's PR #4 lands) syncGmail.
 */
export async function autoAssignTrip(startAt: string): Promise<string | null> {
  const all = await db.select().from(trips);
  const matches = all.filter((t) => {
    const day = dateInZone(startAt, t.homeTimezone);
    return day >= t.startDate && day <= t.endDate;
  });
  if (matches.length !== 1) return null;
  return matches[0]?.id ?? null;
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
