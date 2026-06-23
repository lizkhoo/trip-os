/**
 * Pathway 5 — Cross-path dedup contract (Gmail + Upload → ONE reservation).
 *
 * The SAME logical reservation arriving via BOTH ingestion paths must collapse
 * to exactly ONE reservation row. This is the shared-dedup contract: it must be
 * enforced by production code (dedup.ts + reservations.findDuplicateReservation,
 * called from BOTH runGmailSync and runUploadSync before a reservation is born),
 * not by the test.
 *
 * Both orchestrators are driven for real through the DB port. The dedup key for a
 * flight is (carrier, flight_number, date-in-zone) — title/seat/time-of-day are
 * deliberately NOT in the key, so the two paths can disagree on those and still
 * dedup.
 *
 * CASE 1 — Gmail first, then Upload (the primary contract):
 *   gmail sync auto-promotes a hi-conf flight → ONE reservation (source='gmail').
 *   An upload of the SAME flight (different title/seat/time-of-day) then runs;
 *   still EXACTLY ONE reservation, and the upload candidate is 'merged_into' the
 *   original gmail reservation. The upload's attachment row is still created.
 *
 * CASE 2 — reverse order (Upload first, then Gmail), fresh harness:
 *   proves dedup is order-independent (lives in shared code, not one path).
 *
 * CASE 3 — negative control: a DIFFERENT flight via the second path creates a
 *   SECOND reservation, proving the key actually discriminates.
 */
import { eq } from 'drizzle-orm';
import { __setDbForTest, type Db } from '@/db/client';
import { attachments, extractionCandidates, settings } from '@/db/schema';
import { createTrip } from '@/services/trips';
import { runGmailSync } from '@/services/syncGmail';
import { runUploadSync } from '@/services/syncUpload';
import { getCandidate } from '@/services/candidates';
import { listReservationsForTrip } from '@/services/reservations';
import type { ReservationProposal } from '@/domain/reservation';
import type { ExtractionResult } from '@/services/extract';
import {
  createHarness,
  installMockAttachmentExtract,
  installMockExtract,
  installMockGmail,
  installMockOcr,
  installMockStorage,
} from './harness';
import type { E2eTest } from './runner';

export const name = 'Pathway 5 — Cross-path dedup (Gmail + Upload → one reservation)';

// Same logical flight: NH 110 on 2026-03-15 in Asia/Tokyo. The dedup key only
// looks at (carrier, flight_number, date-in-zone), so the two paths intentionally
// disagree on title / seat / time-of-day to prove those are NOT keyed on.
const CARRIER = 'NH';
const FLIGHT_NUMBER = '110';

/** The flight as Gmail extracts it (one title/time-of-day). */
function gmailFlightProposal(sourceRef: string): ReservationProposal {
  return {
    type: 'flight',
    title: 'NH 110 HND → ITM (Gmail confirmation)',
    start_at: '2026-03-15T09:00:00+09:00',
    source: 'gmail',
    source_ref: sourceRef,
    confidence: 0.95,
    status: 'confirmed',
    details: {
      carrier: CARRIER,
      flight_number: FLIGHT_NUMBER,
      depart_iata: 'HND',
      arrive_iata: 'ITM',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
}

/**
 * The SAME flight as the Upload path extracts it — deliberately a DIFFERENT
 * title, a seat, and a different time-of-day (still the same local date), to
 * prove the dedup key ignores everything but (carrier, flight_number, date).
 */
function uploadFlightProposal(sourceRef: string): ReservationProposal {
  return {
    type: 'flight',
    title: 'Flight NH110 — boarding pass scan',
    start_at: '2026-03-15T09:35:00+09:00',
    source: 'upload',
    source_ref: sourceRef,
    confidence: 0.97,
    status: 'confirmed',
    details: {
      carrier: CARRIER,
      flight_number: FLIGHT_NUMBER,
      depart_iata: 'HND',
      arrive_iata: 'ITM',
      seat: '14A',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
}

/** A DIFFERENT flight (different flight_number) — must NOT dedup. */
function differentFlightProposal(sourceRef: string): ReservationProposal {
  return {
    type: 'flight',
    title: 'Flight NH 22 — boarding pass scan',
    start_at: '2026-03-15T18:00:00+09:00',
    source: 'upload',
    source_ref: sourceRef,
    confidence: 0.97,
    status: 'confirmed',
    details: {
      carrier: CARRIER,
      flight_number: '22',
      depart_iata: 'ITM',
      arrive_iata: 'HND',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
}

function ok(proposed: ReservationProposal): ExtractionResult {
  return {
    ok: true,
    proposed_reservation: proposed,
    confidence: proposed.confidence ?? 0.95,
    raw_claude_response: '{"mock":"flight"}',
  };
}

const FLIGHT_MSG = 'msg-flight-cross';
const OCR_TEXT = 'BOARDING PASS\nNH 110\nHND → ITM\n2026-03-15\nSeat 14A';

async function setThreshold(harness: ReturnType<typeof createHarness>): Promise<void> {
  await harness.db
    .update(settings)
    .set({ autoPromoteThreshold: 0.9 })
    .where(eq(settings.id, 'default'));
}

export const test: E2eTest = async ({ harness, assert, assertEqual }) => {
  // ====================================================================
  // CASE 1 — Gmail first, then Upload (the primary contract).
  // ====================================================================
  await setThreshold(harness);

  const trip = await createTrip({
    title: 'Japan 2026',
    start_date: '2026-03-14',
    end_date: '2026-03-21',
    home_timezone: 'Asia/Tokyo',
  });

  // --- Gmail path: hi-conf flight auto-promotes to ONE reservation. -----------
  installMockGmail([
    { id: FLIGHT_MSG, subject: 'ANA flight confirmation', bodyText: 'NH 110 HND→ITM 2026-03-15' },
  ]);
  installMockExtract(
    new Map<string, ExtractionResult>([[FLIGHT_MSG, ok(gmailFlightProposal(FLIGHT_MSG))]]),
  );

  const gmailResult = await runGmailSync();
  assertEqual(gmailResult.candidatesCreated, 1, '1: gmail sync created 1 candidate');
  assertEqual(gmailResult.promoted, 1, '1: gmail flight auto-promoted');

  const afterGmail = await listReservationsForTrip(trip.id);
  assertEqual(afterGmail.length, 1, '1: exactly ONE reservation after gmail sync');
  const gmailReservation = afterGmail[0];
  assertEqual(gmailReservation?.source, 'gmail', "1: the reservation source='gmail'");
  assertEqual(gmailReservation?.type, 'flight', '1: the reservation is the flight');
  const gmailReservationId = gmailReservation?.id;
  assert(typeof gmailReservationId === 'string', '1: gmail reservation has an id');

  // --- Upload path: the SAME logical flight (different title/seat/time). -------
  installMockStorage();
  installMockOcr(OCR_TEXT);
  installMockAttachmentExtract((args) => ok(uploadFlightProposal(args.source_ref)));

  const uploadResult = await runUploadSync({
    uri: 'file:///picked/boarding-pass.png',
    kind: 'image',
  });
  assertEqual(uploadResult.candidatesCreated, 1, '1: upload created 1 candidate');
  // The upload deduped: it must NOT promote into a new reservation.
  assertEqual(uploadResult.promoted, 0, '1: upload did NOT create a second reservation');

  // THE CONTRACT: still EXACTLY ONE reservation in the trip.
  const afterUpload = await listReservationsForTrip(trip.id);
  assertEqual(afterUpload.length, 1, '1: STILL exactly ONE reservation after the upload (deduped)');
  assertEqual(
    afterUpload[0]?.id,
    gmailReservationId,
    '1: the surviving reservation is the original gmail one',
  );

  // The upload candidate is merged_into the original gmail reservation.
  const uploadCand = await getCandidate(uploadResult.candidateId);
  assert(!!uploadCand, '1: upload candidate exists');
  assertEqual(uploadCand?.source, 'upload', "1: upload candidate source='upload'");
  assertEqual(uploadCand?.status, 'merged_into', "1: upload candidate status='merged_into'");
  assertEqual(
    uploadCand?.merged_into_reservation_id,
    gmailReservationId,
    '1: upload candidate merged_into the gmail reservation id',
  );

  // The attachment row was still created (the file is kept even though it deduped).
  const attRow = await harness.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, uploadResult.attachmentId))
    .get();
  assert(!!attRow, '1: upload attachment row was created despite the dedup');
  assertEqual(attRow?.storageUri, uploadResult.storageUri, '1: attachment storage_uri persisted');
  assertEqual(attRow?.ocrText, OCR_TEXT, '1: attachment ocr_text persisted');

  // ====================================================================
  // CASE 2 — reverse order: Upload first, then Gmail (separate harness).
  // ====================================================================
  const h2 = createHarness();
  try {
    await setThreshold(h2);
    const trip2 = await createTrip({
      title: 'Japan 2026 (reverse)',
      start_date: '2026-03-14',
      end_date: '2026-03-21',
      home_timezone: 'Asia/Tokyo',
    });

    // Upload path FIRST: auto-promotes to ONE reservation (source='upload').
    installMockStorage();
    installMockOcr(OCR_TEXT);
    installMockAttachmentExtract((args) => ok(uploadFlightProposal(args.source_ref)));

    const up2 = await runUploadSync({ uri: 'file:///picked/boarding-pass.png', kind: 'image' });
    assertEqual(up2.candidatesCreated, 1, '2: upload created 1 candidate');
    assertEqual(up2.promoted, 1, '2: upload flight auto-promoted');

    const afterUp2 = await listReservationsForTrip(trip2.id);
    assertEqual(afterUp2.length, 1, '2: exactly ONE reservation after upload');
    const uploadReservation = afterUp2[0];
    assertEqual(uploadReservation?.source, 'upload', "2: the reservation source='upload'");
    const uploadReservationId = uploadReservation?.id;
    assert(typeof uploadReservationId === 'string', '2: upload reservation has an id');

    // Gmail path SECOND: the SAME logical flight.
    installMockGmail([
      { id: FLIGHT_MSG, subject: 'ANA flight confirmation', bodyText: 'NH 110 HND→ITM 2026-03-15' },
    ]);
    installMockExtract(
      new Map<string, ExtractionResult>([[FLIGHT_MSG, ok(gmailFlightProposal(FLIGHT_MSG))]]),
    );

    const gm2 = await runGmailSync();
    assertEqual(gm2.candidatesCreated, 1, '2: gmail sync created 1 candidate');
    assertEqual(gm2.promoted, 0, '2: gmail did NOT create a second reservation');

    const afterGm2 = await listReservationsForTrip(trip2.id);
    assertEqual(afterGm2.length, 1, '2: STILL exactly ONE reservation after gmail (deduped)');
    assertEqual(
      afterGm2[0]?.id,
      uploadReservationId,
      '2: the surviving reservation is the original upload one',
    );

    // The gmail candidate is merged_into the existing upload reservation.
    const gmailCandRow = await h2.db
      .select()
      .from(extractionCandidates)
      .where(eq(extractionCandidates.sourceRef, FLIGHT_MSG))
      .get();
    assert(!!gmailCandRow, '2: gmail candidate exists');
    assertEqual(gmailCandRow?.status, 'merged_into', "2: gmail candidate status='merged_into'");
    assertEqual(
      gmailCandRow?.mergedIntoReservationId,
      uploadReservationId,
      '2: gmail candidate merged_into the upload reservation id',
    );
  } finally {
    // The nested harness's teardown nulls module-global hatches — including the
    // DB port (__setDbForTest(null)). Re-inject CASE 1's harness DB so the rest
    // of this test keeps talking to the right (in-memory) database rather than
    // falling through to the lazy expo-sqlite client.
    h2.teardown();
    __setDbForTest(harness.db as unknown as Db);
  }

  // ====================================================================
  // CASE 3 — negative control: a DIFFERENT flight makes a SECOND reservation.
  // (Reuses CASE 1's harness/trip, which already holds the NH 110 reservation.)
  // ====================================================================
  installMockStorage();
  installMockOcr('BOARDING PASS\nNH 22\nITM → HND\n2026-03-15');
  installMockAttachmentExtract((args) => ok(differentFlightProposal(args.source_ref)));

  const up3 = await runUploadSync({ uri: 'file:///picked/boarding-pass-2.png', kind: 'image' });
  assertEqual(up3.candidatesCreated, 1, '3: upload created 1 candidate');
  assertEqual(up3.promoted, 1, '3: a DIFFERENT flight auto-promoted (NOT deduped)');

  const afterDifferent = await listReservationsForTrip(trip.id);
  assertEqual(
    afterDifferent.length,
    2,
    '3: now TWO reservations — the dedup key discriminates by flight_number',
  );

  const cand3 = await getCandidate(up3.candidateId);
  assertEqual(cand3?.status, 'accepted', "3: the different-flight candidate was accepted (not merged)");
};
