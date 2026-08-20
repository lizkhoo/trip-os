/**
 * Pathway 5 — Paste → extract → review → timeline.
 *
 * Mock Claude text extraction drives the REAL `runPasteSync()`. No storage, no
 * OCR, no attachment row: the whole point of the paste path is that it skips
 * all of that.
 *
 * Case A (hi-conf, auto-promote): pasted lodging text extracts above threshold
 * inside the trip range. Asserts a candidate with source='paste' whose raw_text
 * is the pasted text verbatim, that it auto-promoted, that the reservation
 * carries source='paste' (i.e. the widened CHECK in migration 0002 actually
 * admits it), and that it lands on the right timeline day.
 *
 * Case B (lo-conf, manual accept): a dictated-style sentence extracts below
 * threshold, stays pending, and the REAL acceptCandidate promotes it.
 *
 * Case C (cross-path dedup): pasting a booking that already arrived by Gmail
 * flags the candidate as merged_into that reservation rather than silently
 * creating a second copy — the property that makes it safe to have many
 * overlapping ingestion paths.
 *
 * Case D (guardrails): empty/whitespace text and a missing IANA timezone are
 * both refused before anything is written.
 */
import { eq } from 'drizzle-orm';
import { attachments, extractionCandidates, settings } from '@/db/schema';
import { createTrip } from '@/services/trips';
import { runPasteSync } from '@/services/syncPaste';
import { acceptCandidate, getCandidate, listPendingCandidates } from '@/services/candidates';
import { createReservation, listReservationsForTrip } from '@/services/reservations';
import { buildItineraryDays } from '@/lib/itinerary';
import type { Location } from '@/domain/location';
import type { ReservationProposal } from '@/domain/reservation';
import type { EmailExtractionArgs, ExtractionResult } from '@/services/extract';
import { installMockEmailExtract } from './harness';
import type { E2eTest } from './runner';

export const name = 'Pathway 5 — Paste → extract → review → timeline';

const HI_TEXT =
  'Your stay is confirmed.\nPark Hotel Tokyo\nCheck-in Sun, Mar 15, 2026 3:00 PM\nCheck-out Tue, Mar 17, 2026 11:00 AM\nConfirmation 4RT9KX';
const LO_TEXT = 'dinner at maisen on the 18th i think around half seven';
const DUP_TEXT = 'AS 338 RDM to SEA on March 14';

function ok(proposed: ReservationProposal, confidence: number, tag: string): ExtractionResult {
  return {
    ok: true,
    proposed_reservation: proposed,
    confidence,
    raw_claude_response: `{"mock":"${tag}"}`,
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
  // Case A — hi-conf paste auto-promotes.
  // ====================================================================
  const seenArgs: EmailExtractionArgs[] = [];
  installMockEmailExtract((args) => {
    seenArgs.push(args);
    return ok(
      {
        type: 'lodging',
        title: 'Park Hotel Tokyo — 2 nights',
        start_at: '2026-03-15T15:00:00+09:00',
        end_at: '2026-03-17T11:00:00+09:00',
        confirmation_code: '4RT9KX',
        source: 'paste',
        source_ref: args.message_id,
        confidence: 0.95,
        status: 'confirmed',
        details: {
          property_name: 'Park Hotel Tokyo',
          nights: 2,
          iana_timezone: 'Asia/Tokyo',
        },
      } as ReservationProposal,
      0.95,
      'lodging-hi',
    );
  });

  const resultA = await runPasteSync({ text: HI_TEXT });

  assertEqual(resultA.candidatesCreated, 1, 'A: runPasteSync created 1 candidate');
  assertEqual(resultA.promoted, 1, 'A: hi-conf candidate auto-promoted');

  // The orchestrator passed the pasted text through and tagged it as a paste.
  assertEqual(seenArgs.length, 1, 'A: extraction was called exactly once');
  assertEqual(seenArgs[0]?.raw_text, HI_TEXT, 'A: extraction got the pasted text verbatim');
  assertEqual(seenArgs[0]?.source, 'paste', "A: extraction was told source='paste'");
  assertEqual(seenArgs[0]?.message_id, resultA.runId, 'A: extraction got the minted run id');

  const candA = await getCandidate(resultA.candidateId);
  assert(!!candA, 'A: candidate exists');
  assertEqual(candA?.source, 'paste', "A: candidate source='paste'");
  assertEqual(candA?.source_ref, resultA.runId, 'A: candidate source_ref is the run id');
  assertEqual(candA?.raw_text, HI_TEXT, 'A: candidate raw_text is the pasted text');
  assertEqual(candA?.status, 'accepted', 'A: candidate auto-promoted to accepted');
  assertEqual(candA?.trip_id, trip.id, 'A: candidate auto-assigned to the trip');

  const reservationsA = await listReservationsForTrip(trip.id);
  assertEqual(reservationsA.length, 1, 'A: one reservation after auto-promote');
  assertEqual(reservationsA[0]?.type, 'lodging', 'A: the reservation is the lodging');
  // The point of migration 0002 — the widened CHECK admits source='paste'.
  assertEqual(reservationsA[0]?.source, 'paste', "A: reservation source='paste' persisted");

  // No attachment side effects — the paste path never touches storage.
  const attRows = await harness.db.select().from(attachments);
  assertEqual(attRows.length, 0, 'A: paste wrote no attachment rows');

  const daysA = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    reservationsA,
    trip.home_timezone,
    new Map<string, Location>(),
  );
  assert(
    !!daysA.find((d) => d.date === '2026-03-15')?.reservations.some((r) => r.type === 'lodging'),
    'A: lodging lands on 2026-03-15 in the timeline',
  );

  // ====================================================================
  // Case B — lo-conf paste stays pending, then accepts.
  // ====================================================================
  installMockEmailExtract((args) =>
    ok(
      {
        type: 'dining',
        title: 'Tonkatsu Maisen',
        start_at: '2026-03-18T19:30:00+09:00',
        source: 'paste',
        source_ref: args.message_id,
        confidence: 0.5,
        status: 'confirmed',
        details: { party_size: 2, iana_timezone: 'Asia/Tokyo' },
      } as ReservationProposal,
      0.5,
      'dining-lo',
    ),
  );

  const resultB = await runPasteSync({ text: LO_TEXT });
  assertEqual(resultB.promoted, 0, 'B: lo-conf candidate did NOT auto-promote');

  const pending = await listPendingCandidates();
  assertEqual(pending.length, 1, 'B: exactly one candidate is pending');
  assertEqual(pending[0]?.id, resultB.candidateId, 'B: the pending candidate is the lo-conf paste');
  assertEqual(pending[0]?.raw_text, LO_TEXT, 'B: pending candidate kept the dictated text');

  const accepted = await acceptCandidate(resultB.candidateId, { trip_id: trip.id });
  assert(typeof accepted.reservationId === 'string', 'B: acceptCandidate returned a reservation id');

  const reservationsB = await listReservationsForTrip(trip.id);
  assertEqual(reservationsB.length, 2, 'B: two reservations after accepting the pending one');
  assert(
    !!buildItineraryDays(
      trip.start_date,
      trip.end_date,
      reservationsB,
      trip.home_timezone,
      new Map<string, Location>(),
    )
      .find((d) => d.date === '2026-03-18')
      ?.reservations.some((r) => r.type === 'dining'),
    'B: dining lands on 2026-03-18 in the timeline',
  );

  // ====================================================================
  // Case C — pasting something Gmail already ingested flags a merge.
  // ====================================================================
  const existingFlight = await createReservation({
    trip_id: trip.id,
    type: 'flight',
    title: 'AS 338 RDM → SEA',
    start_at: '2026-03-14T09:02:00+09:00',
    source: 'gmail',
    source_ref: 'gmail-msg-1',
    confidence: 0.97,
    status: 'confirmed',
    details: {
      carrier: 'AS',
      flight_number: '338',
      depart_iata: 'RDM',
      arrive_iata: 'SEA',
      iana_timezone: 'Asia/Tokyo',
    },
  });

  installMockEmailExtract((args) =>
    ok(
      {
        type: 'flight',
        title: 'AS 338 RDM → SEA',
        start_at: '2026-03-14T09:02:00+09:00',
        source: 'paste',
        source_ref: args.message_id,
        // Deliberately below threshold so the merge flag is what we observe,
        // not an auto-promoted second copy.
        confidence: 0.6,
        status: 'confirmed',
        details: {
          carrier: 'AS',
          flight_number: '338',
          depart_iata: 'RDM',
          arrive_iata: 'SEA',
          iana_timezone: 'Asia/Tokyo',
        },
      } as ReservationProposal,
      0.6,
      'flight-dup',
    ),
  );

  const resultC = await runPasteSync({ text: DUP_TEXT });
  const candC = await getCandidate(resultC.candidateId);
  assertEqual(
    candC?.merged_into_reservation_id,
    existingFlight.id,
    'C: paste of an already-ingested flight is flagged as a merge into the Gmail reservation',
  );
  assertEqual(
    (await listReservationsForTrip(trip.id)).length,
    3,
    'C: no duplicate reservation was created (the flight + the two accepted pastes)',
  );

  // ====================================================================
  // Case D — guardrails refuse before writing anything.
  // ====================================================================
  const candidatesBefore = (await harness.db.select().from(extractionCandidates)).length;

  let emptyRejected = false;
  try {
    await runPasteSync({ text: '   \n  ' });
  } catch {
    emptyRejected = true;
  }
  assert(emptyRejected, 'D: whitespace-only paste is refused');

  installMockEmailExtract((args) =>
    ok(
      {
        type: 'activity',
        title: 'Something, somewhere',
        start_at: '2026-03-16T10:00:00+09:00',
        source: 'paste',
        source_ref: args.message_id,
        confidence: 0.95,
        status: 'confirmed',
        // No iana_timezone — PRD §"Cross-cutting" says drop it rather than
        // poison the trip with a guessed offset.
        details: { operator: 'Unknown' },
      } as unknown as ReservationProposal,
      0.95,
      'no-tz',
    ),
  );

  let tzRejected = false;
  try {
    await runPasteSync({ text: 'some activity at ten in the morning on the 16th' });
  } catch {
    tzRejected = true;
  }
  assert(tzRejected, 'D: extraction without an IANA timezone is refused');

  assertEqual(
    (await harness.db.select().from(extractionCandidates)).length,
    candidatesBefore,
    'D: neither refusal wrote a candidate row',
  );
};
