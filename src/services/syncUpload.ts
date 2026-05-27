import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, settings as settingsTable, trips } from '@/db/schema';
import { newUuid } from '@/lib/uuid';
import { dateInZone } from '@/lib/time';
import * as storage from './storage';
import { extractReservationFromAttachment } from './extract';
import { createCandidate, autoPromoteAboveThreshold } from './candidates';
import { findDuplicateReservation } from './reservations';
import { recognizeText } from '../../modules/AppleVision';
import type { ReservationInput } from '@/domain/reservation';

export type ImportStep = 'stored' | 'ocr' | 'extracting' | 'done' | 'error';

export interface ImportFileOptions {
  onProgress?: (step: ImportStep, detail?: string) => void;
}

export interface ImportFileResult {
  attachmentId: string;
  candidateId: string | null;
  error?: string;
}

export async function importFile(
  uri: string,
  kind: 'image' | 'pdf',
  opts: ImportFileOptions = {},
): Promise<ImportFileResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const extractionRunId = newUuid();
  const attachmentId = newUuid();
  let storageUri: string | null = null;

  try {
    storageUri = await storage.put(uri, kind);
    await db.insert(attachments).values({
      id: attachmentId,
      kind,
      storageUri,
      extractionRunId,
    });
    onProgress('stored', storageUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onProgress('error', `storage: ${msg}`);
    return { attachmentId, candidateId: null, error: `storage: ${msg}` };
  }

  let ocrText = '';
  let pageImageUris: string[] = [];
  try {
    onProgress('ocr');
    const result = await recognizeText(storageUri);
    ocrText = result.text;
    pageImageUris = result.pageImageUris;
    await db.update(attachments).set({ ocrText }).where(eq(attachments.id, attachmentId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onProgress('error', `ocr: ${msg}`);
    return { attachmentId, candidateId: null, error: `ocr: ${msg}` };
  }

  try {
    onProgress('extracting');
    const extraction = await extractReservationFromAttachment({
      ocr_text: ocrText,
      // Apple Vision returns one rasterised PNG per page for PDFs and the source URI for raw
      // images — either way, the pixels OCR ran on. Claude vision can't ingest .pdf bytes
      // directly, so without this PDF uploads silently lost their image signal.
      image_uris: pageImageUris.length > 0 ? pageImageUris : [storageUri],
      source_ref: extractionRunId,
    });

    const proposed: ReservationInput = {
      ...extraction.proposed_reservation,
      source: 'upload',
      source_ref: extractionRunId,
      confidence: extraction.confidence,
    } as ReservationInput;

    const tripId = await autoAssignTrip(proposed);
    const candidate = await createCandidate({
      trip_id: tripId,
      source: 'upload',
      source_ref: extractionRunId,
      raw_text: ocrText,
      claude_response: extraction.raw_claude_response,
      proposed_reservation: tripId ? ({ ...proposed, trip_id: tripId } as ReservationInput) : proposed,
      confidence: extraction.confidence,
      status: 'pending',
    });

    // findDuplicateReservation runs against the assigned trip; only meaningful when we have one.
    // We don't act on the result here — autoPromote handles the merge-vs-accept decision — but
    // calling it surfaces the duplicate intent in logs and matches Agent 2's flow.
    if (tripId) {
      await findDuplicateReservation({ ...proposed, trip_id: tripId } as ReservationInput);
    }

    const threshold = await loadAutoPromoteThreshold();
    await autoPromoteAboveThreshold(threshold);

    onProgress('done');
    return { attachmentId, candidateId: candidate.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onProgress('error', `extract: ${msg}`);
    return { attachmentId, candidateId: null, error: `extract: ${msg}` };
  }
}

/**
 * Single-trip-match auto-assign. Returns the trip id when the reservation's date falls inside
 * exactly one trip's range (interpreted in that trip's home timezone), otherwise null —
 * matching the "needs trip" inbox rule from the PRD.
 */
async function autoAssignTrip(proposed: ReservationInput): Promise<string | null> {
  const allTrips = await db.select().from(trips);
  const start = proposed.start_at;
  const matches = allTrips.filter((t) => {
    const day = dateInZone(start, t.homeTimezone);
    return day >= t.startDate && day <= t.endDate;
  });
  if (matches.length !== 1) return null;
  return matches[0]?.id ?? null;
}

async function loadAutoPromoteThreshold(): Promise<number> {
  const row = await db.select().from(settingsTable).get();
  return row?.autoPromoteThreshold ?? 0.9;
}

export async function listRecentAttachments(limit = 20) {
  const rows = await db
    .select()
    .from(attachments)
    .orderBy(desc(attachments.createdAt))
    .limit(limit);
  return rows;
}
