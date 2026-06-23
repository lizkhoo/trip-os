/**
 * Pathway 1 — Gmail → review → timeline.
 *
 * Mock Gmail (2 messages) + mock Claude (1 hi-conf flight ≥ threshold, 1 lo-conf
 * dining) drive the REAL `runGmailSync()`. Asserts: 2 candidates created, the
 * hi-conf one auto-promoted to a reservation, the lo-conf one left pending. Then
 * the REAL `acceptCandidate` promotes the pending one, and the REAL
 * `buildItineraryDays` lands both accepted reservations on the right days.
 */
import { eq } from 'drizzle-orm';
import { settings, trips } from '@/db/schema';
import { createTrip } from '@/services/trips';
import { runGmailSync } from '@/services/syncGmail';
import {
  acceptCandidate,
  listPendingCandidates,
} from '@/services/candidates';
import { listReservationsForTrip } from '@/services/reservations';
import { buildItineraryDays } from '@/lib/itinerary';
import type { Location } from '@/domain/location';
import type { ReservationProposal } from '@/domain/reservation';
import type { ExtractionResult } from '@/services/extract';
import { installMockExtract, installMockGmail } from './harness';
import type { E2eTest } from './runner';

export const name = 'Pathway 1 — Gmail → review → timeline';

const FLIGHT_MSG = 'msg-flight-hi';
const DINING_MSG = 'msg-dining-lo';

const FLIGHT_PROPOSAL: ReservationProposal = {
  type: 'flight',
  title: 'NH 110 HND → ITM',
  start_at: '2026-03-15T09:00:00+09:00',
  source: 'gmail',
  source_ref: FLIGHT_MSG,
  confidence: 0.95,
  status: 'confirmed',
  details: {
    carrier: 'NH',
    flight_number: '110',
    depart_iata: 'HND',
    arrive_iata: 'ITM',
    iana_timezone: 'Asia/Tokyo',
  },
} as ReservationProposal;

const DINING_PROPOSAL: ReservationProposal = {
  type: 'dining',
  title: 'Sushi Saito',
  start_at: '2026-03-18T19:00:00+09:00',
  source: 'gmail',
  source_ref: DINING_MSG,
  confidence: 0.6,
  status: 'confirmed',
  details: {
    party_size: 2,
    iana_timezone: 'Asia/Tokyo',
  },
} as ReservationProposal;

export const test: E2eTest = async ({ harness, assert, assertEqual }) => {
  // Threshold for auto-promotion. The default is 0.9; set it explicitly so the
  // hi-conf flight (0.95) promotes and the lo-conf dining (0.6) does not.
  await harness.db
    .update(settings)
    .set({ autoPromoteThreshold: 0.9 })
    .where(eq(settings.id, 'default'));

  // Seed a Japan trip whose range contains both reservation dates in Asia/Tokyo.
  const trip = await createTrip({
    title: 'Japan 2026',
    start_date: '2026-03-14',
    end_date: '2026-03-21',
    home_timezone: 'Asia/Tokyo',
  });

  installMockGmail([
    { id: FLIGHT_MSG, subject: 'ANA flight confirmation', bodyText: 'NH 110 HND→ITM 2026-03-15 09:00 JST' },
    { id: DINING_MSG, subject: 'Reservation confirmed', bodyText: 'Sushi Saito, party of 2, 2026-03-18 19:00' },
  ]);

  const extractions = new Map<string, ExtractionResult>([
    [
      FLIGHT_MSG,
      {
        ok: true,
        proposed_reservation: FLIGHT_PROPOSAL,
        confidence: 0.95,
        raw_claude_response: '{"mock":"flight"}',
      },
    ],
    [
      DINING_MSG,
      {
        ok: true,
        proposed_reservation: DINING_PROPOSAL,
        confidence: 0.6,
        raw_claude_response: '{"mock":"dining"}',
      },
    ],
  ]);
  installMockExtract(extractions);

  // --- Drive the REAL orchestrator -------------------------------------------
  const result = await runGmailSync();
  assertEqual(result.candidatesCreated, 2, 'runGmailSync created 2 candidates');
  assertEqual(result.promoted, 1, 'runGmailSync auto-promoted 1 candidate (≥ threshold)');

  // Hi-conf flight became a reservation; lo-conf dining is still pending.
  const afterSync = await listReservationsForTrip(trip.id);
  assertEqual(afterSync.length, 1, 'one reservation exists after sync (the auto-promoted flight)');
  assertEqual(afterSync[0]?.type, 'flight', 'the auto-promoted reservation is the flight');

  const pending = await listPendingCandidates();
  assertEqual(pending.length, 1, 'one candidate left pending (lo-conf dining)');
  assertEqual(pending[0]?.proposed_reservation.type, 'dining', 'pending candidate is the dining one');

  // --- Accept the pending candidate via the REAL service ----------------------
  const pendingId = pending[0]?.id;
  assert(typeof pendingId === 'string', 'pending candidate has an id');
  if (typeof pendingId !== 'string') return;
  const accepted = await acceptCandidate(pendingId, { trip_id: trip.id });
  assert(typeof accepted.reservationId === 'string', 'acceptCandidate returned a reservation id');

  const afterAccept = await listReservationsForTrip(trip.id);
  assertEqual(afterAccept.length, 2, 'both reservations exist after accepting the pending one');
  const types = afterAccept.map((r) => r.type).sort();
  assertEqual(types.join(','), 'dining,flight', 'reservations are the flight and the dining');

  // --- Build the itinerary through the REAL derivation -------------------------
  const tripRow = await harness.db.select().from(trips).where(eq(trips.id, trip.id)).get();
  assert(!!tripRow, 'trip row readable');
  const locationsById = new Map<string, Location>();
  const days = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    afterAccept,
    trip.home_timezone,
    locationsById,
  );

  const flightDay = days.find((d) => d.date === '2026-03-15');
  const diningDay = days.find((d) => d.date === '2026-03-18');
  assert(!!flightDay?.reservations.some((r) => r.type === 'flight'), 'flight lands on 2026-03-15');
  assert(!!diningDay?.reservations.some((r) => r.type === 'dining'), 'dining lands on 2026-03-18');
  // A day with no reservations stays empty — proves day-bucketing isn't smearing.
  const emptyDay = days.find((d) => d.date === '2026-03-14');
  assertEqual(emptyDay?.reservations.length, 0, '2026-03-14 has no reservations');
};
