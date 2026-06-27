import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { reservations } from '@/db/schema';
import {
  ReservationInputSchema,
  type Reservation,
  type ReservationInput,
} from '@/domain/reservation';
import { newUuid } from '@/lib/uuid';
import { dateInZone, nowIso } from '@/lib/time';
import { computeDedupKey, findDuplicate, type DedupKey } from './dedup';

type Row = typeof reservations.$inferSelect;

function toDomain(row: Row): Reservation {
  const details = JSON.parse(row.details);
  return {
    id: row.id,
    trip_id: row.tripId,
    type: row.type as Reservation['type'],
    title: row.title,
    start_at: row.startAt,
    end_at: row.endAt,
    start_location_id: row.startLocationId,
    end_location_id: row.endLocationId,
    confirmation_code: row.confirmationCode,
    source: row.source as Reservation['source'],
    source_ref: row.sourceRef,
    confidence: row.confidence,
    status: row.status as Reservation['status'],
    details,
    manually_edited_at: row.manuallyEditedAt,
  } as Reservation;
}

export async function createReservation(input: ReservationInput): Promise<Reservation> {
  const parsed = ReservationInputSchema.parse(input);
  const id = newUuid();
  await getDb().insert(reservations).values({
    id,
    tripId: parsed.trip_id,
    type: parsed.type,
    title: parsed.title,
    startAt: parsed.start_at,
    endAt: parsed.end_at ?? null,
    startLocationId: parsed.start_location_id ?? null,
    endLocationId: parsed.end_location_id ?? null,
    confirmationCode: parsed.confirmation_code ?? null,
    source: parsed.source,
    sourceRef: parsed.source_ref ?? null,
    confidence: parsed.confidence ?? null,
    status: parsed.status ?? 'confirmed',
    details: JSON.stringify(parsed.details),
  });
  const row = await getDb().select().from(reservations).where(eq(reservations.id, id)).get();
  if (!row) throw new Error(`createReservation: row not found after insert (id=${id})`);
  return toDomain(row);
}

export interface UpdateOptions {
  /** Whether this update originated from a user-driven edit. Bumps manually_edited_at. */
  manual?: boolean;
}

export async function updateReservation(
  id: string,
  patch: Partial<ReservationInput>,
  opts: UpdateOptions = {},
): Promise<Reservation> {
  const next: Partial<typeof reservations.$inferInsert> = {};
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.start_at !== undefined) next.startAt = patch.start_at;
  if (patch.end_at !== undefined) next.endAt = patch.end_at ?? null;
  if (patch.start_location_id !== undefined) next.startLocationId = patch.start_location_id ?? null;
  if (patch.end_location_id !== undefined) next.endLocationId = patch.end_location_id ?? null;
  if (patch.confirmation_code !== undefined)
    next.confirmationCode = patch.confirmation_code ?? null;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.details !== undefined) next.details = JSON.stringify(patch.details);
  if (opts.manual) next.manuallyEditedAt = nowIso();
  await getDb().update(reservations).set(next).where(eq(reservations.id, id));
  const row = await getDb().select().from(reservations).where(eq(reservations.id, id)).get();
  if (!row) throw new Error(`updateReservation: row not found (id=${id})`);
  return toDomain(row);
}

export async function listReservationsForTrip(tripId: string): Promise<Reservation[]> {
  const rows = await getDb().select().from(reservations).where(eq(reservations.tripId, tripId));
  return rows.map(toDomain);
}

/**
 * Returns reservations whose [start_at, end_at] interval intersects `isoDate` in the trip's
 * home zone. Multi-night lodging therefore appears on every day in its range — the UI is
 * responsible for rendering "night N of M" indicators.
 */
export async function getReservationsByDay(
  tripId: string,
  isoDate: string,
  tripTimezone: string,
): Promise<Reservation[]> {
  const all = await listReservationsForTrip(tripId);
  return all.filter((r) => {
    const startDay = dateInZone(r.start_at, tripTimezone);
    const endDay = r.end_at ? dateInZone(r.end_at, tripTimezone) : startDay;
    return isoDate >= startDay && isoDate <= endDay;
  });
}

export async function findDuplicateReservation(
  candidate: ReservationInput,
): Promise<Reservation | undefined> {
  const key = computeDedupKey(candidate);
  const pool = await listReservationsForTrip(candidate.trip_id);
  const indexed: Array<{ key: DedupKey; row: Reservation }> = pool.map((r) => ({
    key: computeDedupKey(toInput(r)),
    row: r,
  }));
  const hit = findDuplicate(key, indexed);
  return hit?.row;
}

export async function listReservationsForTripWithManualEdits(tripId: string) {
  const all = await listReservationsForTrip(tripId);
  return all.filter((r) => r.manually_edited_at !== null && r.manually_edited_at !== undefined);
}

function toInput(r: Reservation): ReservationInput {
  return {
    trip_id: r.trip_id,
    type: r.type,
    title: r.title,
    start_at: r.start_at,
    end_at: r.end_at ?? null,
    start_location_id: r.start_location_id ?? null,
    end_location_id: r.end_location_id ?? null,
    confirmation_code: r.confirmation_code ?? null,
    source: r.source,
    source_ref: r.source_ref ?? null,
    confidence: r.confidence ?? null,
    status: r.status,
    details: r.details,
  } as ReservationInput;
}

export async function deleteReservation(id: string): Promise<void> {
  await getDb().delete(reservations).where(eq(reservations.id, id));
}

export async function getReservation(id: string): Promise<Reservation | undefined> {
  const row = await getDb().select().from(reservations).where(eq(reservations.id, id)).get();
  return row ? toDomain(row) : undefined;
}

export async function listReservationsBySource(
  tripId: string,
  source: Reservation['source'],
): Promise<Reservation[]> {
  const rows = await getDb()
    .select()
    .from(reservations)
    .where(and(eq(reservations.tripId, tripId), eq(reservations.source, source)));
  return rows.map(toDomain);
}
