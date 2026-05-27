import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, settings as settingsTable } from '@/db/schema';
import { newUuid } from '@/lib/uuid';
import * as storage from './storage';
import { extractReservationFromAttachment } from './extract';
import { createCandidate, autoPromoteAboveThreshold } from './candidates';
import { findDuplicateReservation } from './reservations';
import { autoAssignTrip } from './trips';
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

    // The proposal is shaped by extractReservationFromAttachment, which casts Claude's tool
    // output through `as unknown as ReservationInput` without a Zod parse. Treat these casts
    // as load-bearing: when extract.ts grows an upstream parse, swap these for a safeParse here.
    const proposed: ReservationInput = {
      ...extraction.proposed_reservation,
      source: 'upload',
      source_ref: extractionRunId,
      confidence: extraction.confidence,
    } as ReservationInput;

    const ianaTz =
      (proposed.details as { iana_timezone?: unknown } | undefined)?.iana_timezone;
    if (typeof ianaTz !== 'string' || ianaTz.length === 0) {
      const msg = 'missing IANA timezone';
      onProgress('error', msg);
      return { attachmentId, candidateId: null, error: msg };
    }

    const tripId = await autoAssignTrip(proposed.start_at);
    const proposedForTrip = tripId
      ? ({ ...proposed, trip_id: tripId } as ReservationInput)
      : proposed;

    // Surface duplicates by stamping merged_into_reservation_id on the candidate when one
    // is found. Status stays 'pending' so the user accepts/rejects in review; only
    // acceptCandidate / autoPromoteAboveThreshold flips status to 'merged_into'.
    const dup = tripId !== null ? await findDuplicateReservation(proposedForTrip) : undefined;

    const candidate = await createCandidate({
      trip_id: tripId,
      source: 'upload',
      source_ref: extractionRunId,
      raw_text: ocrText,
      claude_response: extraction.raw_claude_response,
      proposed_reservation: proposedForTrip,
      confidence: extraction.confidence,
      status: 'pending',
      merged_into_reservation_id: dup?.id ?? null,
    });

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
