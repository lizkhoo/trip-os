import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { attachments, extractionCandidates } from '@/db/schema';
import {
  ExtractionCandidateInputSchema,
  type ExtractionCandidate,
  type ExtractionCandidateInput,
} from '@/domain/candidate';
import type { ReservationInput } from '@/domain/reservation';
import { newUuid } from '@/lib/uuid';
import { createReservation, findDuplicateReservation, updateReservation } from './reservations';

type Row = typeof extractionCandidates.$inferSelect;

function toDomain(row: Row): ExtractionCandidate {
  return {
    id: row.id,
    trip_id: row.tripId,
    source: row.source as ExtractionCandidate['source'],
    source_ref: row.sourceRef,
    raw_text: row.rawText,
    claude_response: row.claudeResponse,
    proposed_reservation: JSON.parse(row.proposedReservation),
    confidence: row.confidence,
    status: row.status as ExtractionCandidate['status'],
    merged_into_reservation_id: row.mergedIntoReservationId,
  };
}

export async function createCandidate(
  input: ExtractionCandidateInput,
): Promise<ExtractionCandidate> {
  const parsed = ExtractionCandidateInputSchema.parse(input);
  const id = newUuid();
  await getDb().insert(extractionCandidates).values({
    id,
    tripId: parsed.trip_id ?? null,
    source: parsed.source,
    sourceRef: parsed.source_ref ?? null,
    rawText: parsed.raw_text ?? null,
    claudeResponse: parsed.claude_response ?? null,
    proposedReservation: JSON.stringify(parsed.proposed_reservation),
    confidence: parsed.confidence,
    status: parsed.status ?? 'pending',
    mergedIntoReservationId: parsed.merged_into_reservation_id ?? null,
  });
  const row = await getDb()
    .select()
    .from(extractionCandidates)
    .where(eq(extractionCandidates.id, id))
    .get();
  if (!row) throw new Error(`createCandidate: row not found (id=${id})`);
  return toDomain(row);
}

export async function listPendingCandidates(): Promise<ExtractionCandidate[]> {
  const rows = await getDb()
    .select()
    .from(extractionCandidates)
    .where(eq(extractionCandidates.status, 'pending'));
  return rows.map(toDomain);
}

export async function getCandidate(id: string): Promise<ExtractionCandidate | undefined> {
  const row = await getDb()
    .select()
    .from(extractionCandidates)
    .where(eq(extractionCandidates.id, id))
    .get();
  return row ? toDomain(row) : undefined;
}

/**
 * Accept a pending candidate: create the reservation, mark the candidate
 * accepted, attach any pending attachments tied to the same source_ref.
 *
 * The candidate's row carries the auto-assigned trip_id (null if it needs the
 * user to pick one); we inject it into the proposal here before handing off to
 * createReservation. `edits` may override anything — including trip_id when
 * the user is assigning a trip from the review queue.
 */
export async function acceptCandidate(
  id: string,
  edits?: Partial<ReservationInput>,
): Promise<{ candidate: ExtractionCandidate; reservationId: string }> {
  const candidate = await getCandidate(id);
  if (!candidate) throw new Error(`acceptCandidate: candidate not found (id=${id})`);
  if (candidate.status !== 'pending') {
    throw new Error(`acceptCandidate: candidate is ${candidate.status}, not pending`);
  }
  const merged = {
    ...candidate.proposed_reservation,
    trip_id: candidate.trip_id,
    ...(edits ?? {}),
  } as ReservationInput;
  // createReservation Zod-parses this — a missing trip_id (user didn't assign
  // a trip in the review queue) will surface as a parse failure there.
  const reservation = await createReservation(merged);
  await getDb()
    .update(extractionCandidates)
    .set({
      status: 'accepted',
      mergedIntoReservationId: reservation.id,
    })
    .where(eq(extractionCandidates.id, id));
  if (candidate.source_ref) {
    await getDb()
      .update(attachments)
      .set({ reservationId: reservation.id })
      .where(eq(attachments.extractionRunId, candidate.source_ref));
  }
  const updated = await getCandidate(id);
  if (!updated) throw new Error(`acceptCandidate: lost candidate after update (id=${id})`);
  return { candidate: updated, reservationId: reservation.id };
}

export async function rejectCandidate(id: string): Promise<void> {
  await getDb()
    .update(extractionCandidates)
    .set({ status: 'rejected' })
    .where(eq(extractionCandidates.id, id));
}

/**
 * Auto-promote pending candidates whose confidence ≥ threshold AND have no duplicate
 * reservation already in the trip. Candidates without a trip_id are skipped — they need
 * the user to assign a trip first.
 */
export async function autoPromoteAboveThreshold(threshold: number): Promise<number> {
  const rows = await getDb()
    .select()
    .from(extractionCandidates)
    .where(
      and(
        eq(extractionCandidates.status, 'pending'),
        gte(extractionCandidates.confidence, threshold),
      ),
    );
  let promoted = 0;
  for (const row of rows) {
    const cand = toDomain(row);
    if (!cand.trip_id) continue;
    const proposed: ReservationInput = {
      ...cand.proposed_reservation,
      trip_id: cand.trip_id,
    } as ReservationInput;
    const dup = await findDuplicateReservation(proposed);
    if (dup) {
      // Mark as merged, leave the existing reservation alone unless it was never manually edited.
      await getDb()
        .update(extractionCandidates)
        .set({ status: 'merged_into', mergedIntoReservationId: dup.id })
        .where(eq(extractionCandidates.id, cand.id));
      if (!dup.manually_edited_at) {
        await updateReservation(dup.id, proposed, { manual: false });
      }
      continue;
    }
    await acceptCandidate(cand.id);
    promoted += 1;
  }
  return promoted;
}
