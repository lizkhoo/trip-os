import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { attachments, settings, trips } from '@/db/schema';
import { autoPromoteAboveThreshold, createCandidate } from './candidates';
import { extractReservationFromAttachmentViaHatch } from './extract';
import { ocrImageViaHatch } from './ocr';
import { findDuplicateReservation } from './reservations';
import { putViaHatch, type AttachmentKind } from './storage';
import { dateInZone } from '@/lib/time';
import { newUuid } from '@/lib/uuid';

/**
 * Orchestrate one upload (screenshot / PDF) import. Mirrors runGmailSync's
 * structure but over the file → OCR → vision boundary:
 *   1. copy the picked file into managed storage (storage_uri)
 *   2. OCR the stored file (Apple Vision in prod; deterministic in tests)
 *   3. run Claude vision extraction over the OCR text + image
 *   4. persist an attachments row keyed by the extraction run id
 *   5. write an extraction_candidate (source='upload') tied to the same run id
 *   6. auto-assign a trip when a single trip range contains the start date
 *   7. auto-promote candidates above the threshold
 *
 * CRITICAL: the candidate's source_ref === attachments.extraction_run_id, so
 * acceptCandidate (candidates.ts) links attachments.reservation_id on accept.
 */

const SETTINGS_ID = 'default';

export interface UploadSyncInput {
  uri: string;
  kind: AttachmentKind;
}

export interface UploadSyncResult {
  candidatesCreated: number;
  promoted: number;
  attachmentId: string;
  candidateId: string;
  storageUri: string;
}

export async function runUploadSync(input: UploadSyncInput): Promise<UploadSyncResult> {
  const threshold = await loadAutoPromoteThreshold();

  // The extraction run id ties the attachment row to the candidate so accept
  // (candidates.ts) back-fills attachments.reservation_id. source_ref has no
  // UUID constraint on the candidate, but a uuid keeps it collision-free.
  const runId = newUuid();

  // 1. Copy the picked file into managed storage.
  const storageUri = await putViaHatch(input.uri, input.kind);

  // 2. OCR the stored file.
  const ocrText = await ocrImageViaHatch(storageUri);

  // 3. Claude vision extraction over OCR text + the image.
  const extraction = await extractReservationFromAttachmentViaHatch({
    ocr_text: ocrText,
    image_uris: [storageUri],
    source_ref: runId,
  });

  // 4. Persist the attachment row regardless of extraction outcome — the file is
  // stored and the OCR text is worth keeping even if Claude couldn't parse it.
  const attachmentId = newUuid();
  await getDb().insert(attachments).values({
    id: attachmentId,
    kind: input.kind,
    storageUri,
    ocrText,
    extractionRunId: runId,
  });

  if (!extraction.ok) {
    throw new Error(`runUploadSync: extraction parse failed — ${extraction.error}`);
  }

  // PRD §"Cross-cutting": refuse a candidate without an explicit IANA zone.
  const iana = extraction.proposed_reservation.details?.iana_timezone;
  if (typeof iana !== 'string' || iana.length === 0) {
    throw new Error('runUploadSync: extraction is missing details.iana_timezone');
  }

  // 6. Auto-assign a trip when exactly one trip range contains the start date.
  const tripId = await autoAssignTrip(extraction.proposed_reservation.start_at);

  // Dedup at sync time so the review UI can surface a merge.
  let mergedIntoReservationId: string | null = null;
  if (tripId) {
    const dup = await findDuplicateReservation({
      ...extraction.proposed_reservation,
      trip_id: tripId,
    });
    if (dup) mergedIntoReservationId = dup.id;
  }

  // 5. Write the candidate, keyed by the same run id as the attachment.
  const candidate = await createCandidate({
    trip_id: tripId,
    source: 'upload',
    source_ref: runId,
    raw_text: ocrText,
    claude_response: extraction.raw_claude_response,
    proposed_reservation: extraction.proposed_reservation,
    confidence: extraction.confidence,
    status: 'pending',
    merged_into_reservation_id: mergedIntoReservationId,
  });

  // 7. Auto-promote above the threshold (links the attachment via accept).
  const promoted = await autoPromoteAboveThreshold(threshold);

  return {
    candidatesCreated: 1,
    promoted,
    attachmentId,
    candidateId: candidate.id,
    storageUri,
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

// Re-export the orchestrator-level test hatches so the consumer doesn't have to
// know which boundary to mock (mirrors syncGmail.ts).
export { __setStorageForTest } from './storage';
export { __setOcrForTest } from './ocr';
export { __setExtractForTest } from './extract';
