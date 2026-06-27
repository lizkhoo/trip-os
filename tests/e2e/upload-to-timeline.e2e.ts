/**
 * Pathway 2 — Upload → OCR → extract → review → timeline.
 *
 * Mock storage + mock OCR + mock Claude vision drive the REAL `runUploadSync()`.
 *
 * Case A (hi-conf, auto-promote): a screenshot extracts ONE reservation ≥ the
 * auto-promote threshold, inside the trip's date range. Asserts an attachments
 * row exists (storage_uri + ocr_text), an extraction_candidate (source='upload')
 * was created, the candidate auto-promoted to a reservation, the attachments
 * row's reservation_id is ACTUALLY populated (== the new reservation id, not
 * inferred), and buildItineraryDays lands the reservation on the right day.
 *
 * Case B (lo-conf, manual accept): a second upload extracts BELOW threshold so it
 * stays pending; the REAL acceptCandidate(id, { trip_id }) then accepts it AND
 * links the attachment (attachment.reservation_id populated after accept).
 */
import { eq } from 'drizzle-orm';
import { attachments, extractionCandidates, settings, trips } from '@/db/schema';
import { createTrip } from '@/services/trips';
import { runUploadSync } from '@/services/syncUpload';
import { acceptCandidate, getCandidate, listPendingCandidates } from '@/services/candidates';
import { listReservationsForTrip } from '@/services/reservations';
import { buildItineraryDays } from '@/lib/itinerary';
import type { Location } from '@/domain/location';
import type { ReservationProposal } from '@/domain/reservation';
import type { ExtractionResult } from '@/services/extract';
import {
  installMockAttachmentExtract,
  installMockOcr,
  installMockStorage,
} from './harness';
import type { E2eTest } from './runner';

export const name = 'Pathway 2 — Upload → OCR → extract → review → timeline';

const HI_OCR = 'LODGING CONFIRMATION\nPark Hotel Tokyo\nCheck-in 2026-03-15';
const LO_OCR = 'receipt — restaurant, party of 2';

/** Build a hi-conf lodging proposal echoing the orchestrator-minted source_ref. */
function hiConfResult(sourceRef: string): ExtractionResult {
  const proposed: ReservationProposal = {
    type: 'lodging',
    title: 'Park Hotel Tokyo — 2 nights',
    start_at: '2026-03-15T15:00:00+09:00',
    end_at: '2026-03-17T11:00:00+09:00',
    source: 'upload',
    source_ref: sourceRef,
    confidence: 0.96,
    status: 'confirmed',
    details: {
      property_name: 'Park Hotel Tokyo',
      nights: 2,
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
  return {
    ok: true,
    proposed_reservation: proposed,
    confidence: 0.96,
    raw_claude_response: '{"mock":"lodging-hi"}',
  };
}

/** Build a lo-conf dining proposal echoing the orchestrator-minted source_ref. */
function loConfResult(sourceRef: string): ExtractionResult {
  const proposed: ReservationProposal = {
    type: 'dining',
    title: 'Tonkatsu Maisen',
    start_at: '2026-03-18T19:30:00+09:00',
    source: 'upload',
    source_ref: sourceRef,
    confidence: 0.55,
    status: 'confirmed',
    details: {
      party_size: 2,
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
  return {
    ok: true,
    proposed_reservation: proposed,
    confidence: 0.55,
    raw_claude_response: '{"mock":"dining-lo"}',
  };
}

export const test: E2eTest = async ({ harness, assert, assertEqual }) => {
  await harness.db
    .update(settings)
    .set({ autoPromoteThreshold: 0.9 })
    .where(eq(settings.id, 'default'));

  const trip = await createTrip({
    title: 'Japan 2026',
    start_date: '2026-03-14',
    end_date: '2026-03-21',
    home_timezone: 'Asia/Tokyo',
  });

  // ====================================================================
  // Case A — hi-conf upload auto-promotes and links the attachment.
  // ====================================================================
  const puts = installMockStorage();
  installMockOcr(HI_OCR);
  // The orchestrator mints the run id and passes it as source_ref; echo it.
  installMockAttachmentExtract((args) => hiConfResult(args.source_ref));

  const resultA = await runUploadSync({ uri: 'file:///picked/screenshot-hotel.png', kind: 'image' });

  assertEqual(resultA.candidatesCreated, 1, 'A: runUploadSync created 1 candidate');
  assertEqual(resultA.promoted, 1, 'A: hi-conf candidate auto-promoted');
  // Storage put() actually ran with the picked uri + kind.
  assertEqual(puts.length, 1, 'A: storage.put called once');
  assertEqual(puts[0]?.sourceUri, 'file:///picked/screenshot-hotel.png', 'A: put got the picked uri');
  assertEqual(puts[0]?.kind, 'image', 'A: put got kind=image');

  // Attachment row exists with the storage_uri + ocr_text.
  const attA = await harness.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, resultA.attachmentId))
    .get();
  assert(!!attA, 'A: attachment row exists');
  assertEqual(attA?.storageUri, resultA.storageUri, 'A: attachment storage_uri matches');
  assertEqual(attA?.storageUri, puts[0]?.storageUri, 'A: attachment storage_uri is the mock storage uri');
  assertEqual(attA?.ocrText, HI_OCR, 'A: attachment ocr_text persisted');
  assertEqual(attA?.kind, 'image', 'A: attachment kind=image');

  // Candidate exists, source='upload', and was promoted (merged_into the reservation).
  const candA = await getCandidate(resultA.candidateId);
  assert(!!candA, 'A: candidate exists');
  assertEqual(candA?.source, 'upload', "A: candidate source='upload'");
  assertEqual(candA?.status, 'accepted', 'A: candidate auto-promoted to accepted');

  // Exactly one reservation, in the trip.
  const reservationsA = await listReservationsForTrip(trip.id);
  assertEqual(reservationsA.length, 1, 'A: one reservation after auto-promote');
  const reservationA = reservationsA[0];
  assertEqual(reservationA?.type, 'lodging', 'A: the reservation is the lodging');
  assertEqual(reservationA?.source, 'upload', "A: reservation source='upload'");

  // CRITICAL: assert the attachment's reservation_id is ACTUALLY populated.
  const attALinked = await harness.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, resultA.attachmentId))
    .get();
  assert(typeof attALinked?.reservationId === 'string', 'A: attachment.reservation_id populated');
  assertEqual(
    attALinked?.reservationId,
    reservationA?.id,
    'A: attachment linked to the new reservation',
  );

  // Timeline includes the reservation on the right day (check-in 2026-03-15).
  const locationsById = new Map<string, Location>();
  const daysA = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    reservationsA,
    trip.home_timezone,
    locationsById,
  );
  const checkInDay = daysA.find((d) => d.date === '2026-03-15');
  assert(
    !!checkInDay?.reservations.some((r) => r.type === 'lodging'),
    'A: lodging lands on 2026-03-15 in the timeline',
  );

  // ====================================================================
  // Case B — lo-conf upload stays pending, then accept links the attachment.
  // ====================================================================
  installMockOcr(LO_OCR);
  installMockAttachmentExtract((args) => loConfResult(args.source_ref));

  const resultB = await runUploadSync({ uri: 'file:///picked/receipt.pdf', kind: 'pdf' });
  assertEqual(resultB.candidatesCreated, 1, 'B: runUploadSync created 1 candidate');
  assertEqual(resultB.promoted, 0, 'B: lo-conf candidate did NOT auto-promote');

  const pending = await listPendingCandidates();
  assertEqual(pending.length, 1, 'B: exactly one candidate is pending');
  assertEqual(pending[0]?.id, resultB.candidateId, 'B: the pending candidate is the lo-conf upload');
  assertEqual(pending[0]?.source, 'upload', "B: pending candidate source='upload'");

  // Attachment B exists but is NOT yet linked.
  const attBPre = await harness.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, resultB.attachmentId))
    .get();
  assert(!!attBPre, 'B: attachment row exists');
  assertEqual(attBPre?.ocrText, LO_OCR, 'B: attachment ocr_text persisted');
  assertEqual(attBPre?.kind, 'pdf', 'B: attachment kind=pdf');
  assertEqual(attBPre?.reservationId, null, 'B: attachment NOT linked before accept');

  // Accept through the REAL service, assigning the trip.
  const accepted = await acceptCandidate(resultB.candidateId, { trip_id: trip.id });
  assert(typeof accepted.reservationId === 'string', 'B: acceptCandidate returned a reservation id');

  const reservationsB = await listReservationsForTrip(trip.id);
  assertEqual(reservationsB.length, 2, 'B: two reservations after accepting the pending one');

  // CRITICAL: attachment B's reservation_id populated after accept.
  const attBPost = await harness.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, resultB.attachmentId))
    .get();
  assert(typeof attBPost?.reservationId === 'string', 'B: attachment.reservation_id populated after accept');
  assertEqual(
    attBPost?.reservationId,
    accepted.reservationId,
    'B: attachment linked to the accepted reservation',
  );

  // Sanity: only the two upload candidates exist (no stray rows).
  const allCands = await harness.db.select().from(extractionCandidates);
  assertEqual(allCands.length, 2, 'two candidates total (A + B)');

  // Timeline now includes both reservations on their days.
  const daysB = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    reservationsB,
    trip.home_timezone,
    new Map<string, Location>(),
  );
  const diningDay = daysB.find((d) => d.date === '2026-03-18');
  assert(
    !!diningDay?.reservations.some((r) => r.type === 'dining'),
    'B: dining lands on 2026-03-18 in the timeline',
  );

  // The trip row is still readable (no cascade surprises).
  const tripRow = await harness.db.select().from(trips).where(eq(trips.id, trip.id)).get();
  assert(!!tripRow, 'trip row readable at end');
};
