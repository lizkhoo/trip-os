import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { settings, trips } from '@/db/schema';
import { autoPromoteAboveThreshold, createCandidate } from './candidates';
import { extractReservationFromEmailViaHatch } from './extract';
import { findDuplicateReservation } from './reservations';
import { dateInZone } from '@/lib/time';
import { newUuid } from '@/lib/uuid';

/**
 * Orchestrate one paste import — the cheapest ingestion path. Mirrors
 * runGmailSync / runUploadSync but over free text the user pasted or dictated,
 * so there is no message to fetch, no file to store, and no OCR:
 *   1. mint a run id (the candidate's source_ref — pastes have no natural id)
 *   2. run Claude extraction over the text
 *   3. auto-assign a trip when a single trip range contains the start date
 *   4. dedup so the review queue can offer a merge
 *   5. write an extraction_candidate (source='paste')
 *   6. auto-promote above the threshold
 *
 * Unlike the upload path there is nothing to persist when extraction fails —
 * no attachment row, no OCR text worth keeping — so a failed extraction throws
 * and the screen surfaces it. The user still has the text in their clipboard.
 */

const SETTINGS_ID = 'default';

/** Long enough to be a reservation, short enough not to blow up a Claude call. */
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 20_000;

export interface PasteSyncInput {
  text: string;
}

export interface PasteSyncResult {
  candidatesCreated: number;
  promoted: number;
  candidateId: string;
  /** The minted run id, stored as the candidate's source_ref. */
  runId: string;
}

export async function runPasteSync(input: PasteSyncInput): Promise<PasteSyncResult> {
  const text = input.text.trim();
  if (text.length < MIN_TEXT_LENGTH) {
    throw new Error('runPasteSync: paste some text with a date, a place, and a time in it.');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `runPasteSync: that is ${text.length} characters — trim it to the confirmation itself (max ${MAX_TEXT_LENGTH}).`,
    );
  }

  const threshold = await loadAutoPromoteThreshold();

  // A paste has no natural source ref (no message id, no file), so mint one.
  // It also keeps re-pastes of the same text as separate candidates rather than
  // silently colliding — dedup below is what catches the real duplicate.
  const runId = newUuid();

  const extraction = await extractReservationFromEmailViaHatch({
    raw_text: text,
    message_id: runId,
    source: 'paste',
  });

  if (!extraction.ok) {
    throw new Error(`runPasteSync: extraction parse failed — ${extraction.error}`);
  }

  // PRD §"Cross-cutting": refuse a candidate without an explicit IANA zone.
  const iana = extraction.proposed_reservation.details?.iana_timezone;
  if (typeof iana !== 'string' || iana.length === 0) {
    throw new Error('runPasteSync: extraction is missing details.iana_timezone');
  }

  const tripId = await autoAssignTrip(extraction.proposed_reservation.start_at);

  // Dedup at sync time so the review UI can surface a merge. Pastes overlap the
  // other paths by design — the same booking may already have arrived by Gmail.
  let mergedIntoReservationId: string | null = null;
  if (tripId) {
    const dup = await findDuplicateReservation({
      ...extraction.proposed_reservation,
      trip_id: tripId,
    });
    if (dup) mergedIntoReservationId = dup.id;
  }

  const candidate = await createCandidate({
    trip_id: tripId,
    source: 'paste',
    source_ref: runId,
    raw_text: text,
    claude_response: extraction.raw_claude_response,
    proposed_reservation: extraction.proposed_reservation,
    confidence: extraction.confidence,
    status: 'pending',
    merged_into_reservation_id: mergedIntoReservationId,
  });

  const promoted = await autoPromoteAboveThreshold(threshold);

  return {
    candidatesCreated: 1,
    promoted,
    candidateId: candidate.id,
    runId,
  };
}

async function loadAutoPromoteThreshold(): Promise<number> {
  const row = await getDb().select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
  return row?.autoPromoteThreshold ?? 0.9;
}

async function autoAssignTrip(startAt: string): Promise<string | null> {
  const all = await getDb().select().from(trips);
  const matches = all.filter((t) => {
    const day = dateInZone(startAt, t.homeTimezone);
    return day >= t.startDate && day <= t.endDate;
  });
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

// Re-export the orchestrator-level test hatch (mirrors syncGmail.ts / syncUpload.ts).
export { __setExtractForTest } from './extract';
