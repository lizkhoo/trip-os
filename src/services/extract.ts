import type { ReservationInput } from '@/domain/reservation';

/**
 * Contract stub. Agent 2 (Gmail ingestion) owns the canonical implementation
 * of both functions below — Anthropic API, tool-use mode mirroring
 * `ReservationInputSchema`, prompt caching on the system prompt, explicit
 * IANA-timezone requirement, etc. Agent 3 (Upload + OCR) consumes the vision
 * variant; the contract is fixed so both agents can build in parallel and
 * either PR can merge first without conflict.
 *
 * Treat the function signatures as load-bearing — don't change them without
 * coordinating the call sites in syncGmail.ts and syncUpload.ts.
 */

export interface ExtractionResult {
  proposed_reservation: ReservationInput;
  confidence: number;
  raw_claude_response: string;
}

export interface EmailExtractionArgs {
  raw_text: string;
  message_id: string;
  /** Optional hint — Gmail-derived trip id when the date matches exactly one trip. */
  hint_trip_id?: string | null;
}

export interface AttachmentExtractionArgs {
  ocr_text: string;
  /** File URIs (local) for the rasterised pages/images Claude vision should look at. */
  image_uris: string[];
  source_ref: string;
  hint_trip_id?: string | null;
}

export async function extractReservationFromEmail(
  _args: EmailExtractionArgs,
): Promise<ExtractionResult> {
  throw new Error(
    'extractReservationFromEmail not yet implemented — owned by the Gmail ingestion vertical (Agent 2)',
  );
}

export async function extractReservationFromAttachment(
  _args: AttachmentExtractionArgs,
): Promise<ExtractionResult> {
  throw new Error(
    'extractReservationFromAttachment not yet implemented — owned by the Gmail ingestion vertical (Agent 2)',
  );
}
