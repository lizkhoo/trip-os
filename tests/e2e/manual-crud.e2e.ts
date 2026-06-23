/**
 * Pathway 3 — Manual reservation CRUD + re-sync edit-guard.
 *
 * Drives the REAL reservation/candidate services through the DB port to prove:
 *   A) MANUAL CREATE — createReservation(source='manual') persists and lands on
 *      the right itinerary day.
 *   B) MANUAL EDIT — updateReservation(id, patch, { manual: true }) changes the
 *      field AND stamps manually_edited_at (non-null).
 *   C) EDIT-GUARD (protected) — a hi-conf gmail candidate that DEDUPS to the
 *      manually-edited reservation is marked merged_into but does NOT overwrite
 *      the user's edit (autoPromoteAboveThreshold's manual-guard branch holds).
 *   D) UPDATE-ALLOWED — a SECOND, never-edited reservation with a matching dup
 *      candidate IS updated from the proposal (the manual:false branch runs).
 *      This proves the two-branch behavior, not just "never overwrites".
 *   E) DELETE — deleteReservation removes it from listReservationsForTrip and
 *      from buildItineraryDays output.
 *
 * Dedup note: flight keys are (carrier, flight_number, date-in-zone) — see
 * src/services/dedup.ts. Both guard scenarios keep those three identical between
 * the reservation and the candidate proposal, and vary only `title` (which is
 * NOT part of the flight dedup key) so the dedup still hits while the edited
 * field is observable.
 */
import { createTrip } from '@/services/trips';
import {
  createReservation,
  updateReservation,
  deleteReservation,
  listReservationsForTrip,
  getReservation,
} from '@/services/reservations';
import { createCandidate, autoPromoteAboveThreshold, getCandidate } from '@/services/candidates';
import { buildItineraryDays } from '@/lib/itinerary';
import type { Location } from '@/domain/location';
import type { ReservationInput, ReservationProposal } from '@/domain/reservation';
import type { E2eTest } from './runner';

export const name = 'Pathway 3 — manual reservation CRUD + re-sync edit-guard';

const THRESHOLD = 0.9;
const NO_LOCATIONS = new Map<string, Location>();

export const test: E2eTest = async ({ assert, assertEqual }) => {
  const trip = await createTrip({
    title: 'Manual CRUD trip',
    start_date: '2026-03-14',
    end_date: '2026-03-21',
    home_timezone: 'Asia/Tokyo',
  });

  // --- A) MANUAL CREATE ------------------------------------------------------
  const createInput: ReservationInput = {
    trip_id: trip.id,
    type: 'flight',
    title: 'NH 110 HND → ITM',
    start_at: '2026-03-15T09:00:00+09:00',
    source: 'manual',
    details: {
      carrier: 'NH',
      flight_number: '110',
      depart_iata: 'HND',
      arrive_iata: 'ITM',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationInput;
  const created = await createReservation(createInput);
  assert(typeof created.id === 'string' && created.id.length > 0, 'createReservation minted an id');
  assertEqual(created.source, 'manual', 'created reservation source is manual');
  assertEqual(created.manually_edited_at ?? null, null, 'fresh manual create has no manually_edited_at');

  const afterCreate = await listReservationsForTrip(trip.id);
  assertEqual(afterCreate.length, 1, 'one reservation persists after manual create');
  assertEqual(afterCreate[0]?.id, created.id, 'persisted reservation is the created one');

  const daysAfterCreate = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    afterCreate,
    trip.home_timezone,
    NO_LOCATIONS,
  );
  const createDay = daysAfterCreate.find((d) => d.date === '2026-03-15');
  assert(
    !!createDay?.reservations.some((r) => r.id === created.id),
    'manual reservation appears on 2026-03-15 in buildItineraryDays',
  );

  // --- B) MANUAL EDIT --------------------------------------------------------
  const EDITED_TITLE = 'NH 110 HND → ITM (user fixed gate)';
  const edited = await updateReservation(created.id, { title: EDITED_TITLE }, { manual: true });
  assertEqual(edited.title, EDITED_TITLE, 'manual edit changed the title');
  assert(
    edited.manually_edited_at !== null && edited.manually_edited_at !== undefined,
    'manual edit stamped manually_edited_at (non-null)',
  );

  // --- C) EDIT-GUARD ON RE-SYNC (protected branch) ---------------------------
  // A gmail proposal for the SAME flight (same carrier/number/date → dedups) but
  // with a DIFFERENT title. The guard must keep the user's edited title.
  const guardProposal: ReservationProposal = {
    type: 'flight',
    title: 'NH 110 HND → ITM (gmail re-extract)',
    start_at: '2026-03-15T09:05:00+09:00', // jittered time; flight key is date-only
    source: 'gmail',
    source_ref: 'msg-guard',
    confidence: 0.96,
    status: 'confirmed',
    details: {
      carrier: 'NH',
      flight_number: '110',
      depart_iata: 'HND',
      arrive_iata: 'ITM',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
  const guardCandidate = await createCandidate({
    trip_id: trip.id,
    source: 'gmail',
    source_ref: 'msg-guard',
    proposed_reservation: guardProposal,
    confidence: 0.96,
    status: 'pending',
  });

  await autoPromoteAboveThreshold(THRESHOLD);

  const guardAfter = await getCandidate(guardCandidate.id);
  assertEqual(guardAfter?.status, 'merged_into', 'guard candidate is marked merged_into (dedup hit)');
  assertEqual(
    guardAfter?.merged_into_reservation_id,
    created.id,
    'guard candidate points at the existing manually-edited reservation',
  );

  const protectedRes = await getReservation(created.id);
  assertEqual(
    protectedRes?.title,
    EDITED_TITLE,
    'manually-edited title is UNCHANGED after re-sync (edit-guard held)',
  );
  assert(
    protectedRes?.manually_edited_at !== null && protectedRes?.manually_edited_at !== undefined,
    'manually-edited reservation still carries manually_edited_at',
  );
  // The trip still has exactly one reservation — the dedup did not create a second.
  const afterGuard = await listReservationsForTrip(trip.id);
  assertEqual(afterGuard.length, 1, 'no duplicate reservation created by the guarded re-sync');

  // --- D) UPDATE-ALLOWED branch (never-edited dup IS updated) -----------------
  const plainInput: ReservationInput = {
    trip_id: trip.id,
    type: 'flight',
    title: 'NH 200 ITM → HND',
    start_at: '2026-03-20T18:00:00+09:00',
    source: 'gmail',
    details: {
      carrier: 'NH',
      flight_number: '200',
      depart_iata: 'ITM',
      arrive_iata: 'HND',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationInput;
  const plain = await createReservation(plainInput);
  assertEqual(plain.manually_edited_at ?? null, null, 'second reservation is not manually edited');

  const UPDATED_TITLE = 'NH 200 ITM → HND (gmail corrected terminal)';
  const updateProposal: ReservationProposal = {
    type: 'flight',
    title: UPDATED_TITLE,
    start_at: '2026-03-20T18:10:00+09:00', // jitter; same date → dedups
    source: 'gmail',
    source_ref: 'msg-update',
    confidence: 0.97,
    status: 'confirmed',
    details: {
      carrier: 'NH',
      flight_number: '200',
      depart_iata: 'ITM',
      arrive_iata: 'HND',
      iana_timezone: 'Asia/Tokyo',
    },
  } as ReservationProposal;
  const updateCandidate = await createCandidate({
    trip_id: trip.id,
    source: 'gmail',
    source_ref: 'msg-update',
    proposed_reservation: updateProposal,
    confidence: 0.97,
    status: 'pending',
  });

  await autoPromoteAboveThreshold(THRESHOLD);

  const updateAfter = await getCandidate(updateCandidate.id);
  assertEqual(updateAfter?.status, 'merged_into', 'update candidate is marked merged_into (dedup hit)');
  assertEqual(
    updateAfter?.merged_into_reservation_id,
    plain.id,
    'update candidate points at the never-edited reservation',
  );

  const updatedRes = await getReservation(plain.id);
  assertEqual(
    updatedRes?.title,
    UPDATED_TITLE,
    'never-edited reservation IS updated from the proposal (manual:false branch ran)',
  );
  // Still no manually_edited_at — the sync update is manual:false.
  assertEqual(
    updatedRes?.manually_edited_at ?? null,
    null,
    'sync update did not stamp manually_edited_at',
  );
  // Two reservations total; neither dup created a new row.
  const afterUpdate = await listReservationsForTrip(trip.id);
  assertEqual(afterUpdate.length, 2, 'still exactly two reservations after the allowed update');

  // --- E) DELETE -------------------------------------------------------------
  await deleteReservation(created.id);
  const gone = await getReservation(created.id);
  assertEqual(gone, undefined, 'deleteReservation removed the reservation');

  const afterDelete = await listReservationsForTrip(trip.id);
  assertEqual(afterDelete.length, 1, 'one reservation remains after delete');
  assert(
    !afterDelete.some((r) => r.id === created.id),
    'deleted reservation is gone from listReservationsForTrip',
  );

  const daysAfterDelete = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    afterDelete,
    trip.home_timezone,
    NO_LOCATIONS,
  );
  const stillPresent = daysAfterDelete.some((d) =>
    d.reservations.some((r) => r.id === created.id),
  );
  assert(!stillPresent, 'deleted reservation no longer appears in buildItineraryDays output');
};
