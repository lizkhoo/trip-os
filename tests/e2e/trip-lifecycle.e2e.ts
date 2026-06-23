/**
 * Pathway 4 — Trip lifecycle + itinerary derivation.
 *
 * Drives the REAL trip/location/reservation services to build a multi-day,
 * multi-city Japan trip, then exercises the REAL itinerary derivations
 * (buildItineraryDays, getCityGroups, nightOfM, getTransitPairs) and asserts
 * they produce the right day cards, city groups, multi-night "night N of M"
 * labels, and transit pairs. No mocks, no orchestrator — this validates the
 * domain/derivation surface end to end against a real database.
 *
 * Trip shape (Asia/Tokyo, 2026-03-14 .. 2026-03-19, 6 days):
 *   03-14  arrival flight HND, 1st night at the Tokyo hotel  (Tokyo, night 1 of 2)
 *   03-15                       2nd night at the Tokyo hotel  (Tokyo, night 2 of 2)
 *   03-16  Shinkansen Tokyo→Kyoto, 1st night at Kyoto ryokan (Kyoto, night 1 of 2)
 *   03-17  Fushimi Inari activity, 2nd night at Kyoto ryokan  (Kyoto, night 2 of 2)
 *   03-18  (checkout morning) — no lodging covers this night  (Travel)
 *   03-19  departure flight ITM                               (Travel)
 */
import { createTrip, getTrip, deleteTrip } from '@/services/trips';
import { findOrCreateLocation } from '@/services/locations';
import {
  createReservation,
  listReservationsForTrip,
} from '@/services/reservations';
import {
  buildItineraryDays,
  getCityGroups,
  getTransitPairs,
  nightOfM,
} from '@/lib/itinerary';
import type { Location } from '@/domain/location';
import type { ReservationInput } from '@/domain/reservation';
import type { E2eTest } from './runner';

export const name = 'Pathway 4 — trip lifecycle + itinerary derivation';

export const test: E2eTest = async ({ assert, assertEqual }) => {
  // --- Trip lifecycle: create + read back through the REAL services ----------
  const trip = await createTrip({
    title: 'Japan 2026',
    start_date: '2026-03-14',
    end_date: '2026-03-19',
    home_timezone: 'Asia/Tokyo',
  });
  assert(typeof trip.id === 'string' && trip.id.length > 0, 'createTrip minted a trip id');

  const readBack = await getTrip(trip.id);
  assert(!!readBack, 'getTrip reads the trip back');
  assertEqual(readBack?.home_timezone, 'Asia/Tokyo', 'trip home timezone round-trips');
  assertEqual(readBack?.start_date, '2026-03-14', 'trip start_date round-trips');
  assertEqual(readBack?.end_date, '2026-03-19', 'trip end_date round-trips');

  // --- Locations: real find-or-create; geocode_query drives city derivation --
  const hndAirport = await findOrCreateLocation({
    name: 'Haneda Airport',
    geocode_query: 'Haneda Airport, Tokyo, Japan',
    timezone: 'Asia/Tokyo',
  });
  const tokyoHotel = await findOrCreateLocation({
    name: 'Park Hotel Tokyo',
    geocode_query: 'Park Hotel Tokyo, Tokyo, Japan',
    timezone: 'Asia/Tokyo',
  });
  const kyotoRyokan = await findOrCreateLocation({
    name: 'Kyoto Ryokan',
    geocode_query: 'Kyoto Ryokan, Kyoto, Japan',
    timezone: 'Asia/Tokyo',
  });
  const fushimiInari = await findOrCreateLocation({
    name: 'Fushimi Inari Taisha',
    geocode_query: 'Fushimi Inari Taisha, Kyoto, Japan',
    timezone: 'Asia/Tokyo',
  });
  const itmAirport = await findOrCreateLocation({
    name: 'Itami Airport',
    geocode_query: 'Itami Airport, Osaka, Japan',
    timezone: 'Asia/Tokyo',
  });

  // find-or-create is idempotent: same geocode_query returns the same row.
  const tokyoHotelAgain = await findOrCreateLocation({
    name: 'Park Hotel Tokyo (dupe)',
    geocode_query: 'Park Hotel Tokyo, Tokyo, Japan',
    timezone: 'Asia/Tokyo',
  });
  assertEqual(tokyoHotelAgain.id, tokyoHotel.id, 'findOrCreateLocation is idempotent on geocode_query');

  // --- Reservations across days + cities, created through the REAL service ----
  const inputs: ReservationInput[] = [
    {
      trip_id: trip.id,
      type: 'flight',
      title: 'NH 110 SEA → HND',
      start_at: '2026-03-14T15:30:00+09:00',
      end_location_id: hndAirport.id,
      source: 'manual',
      details: { carrier: 'NH', flight_number: '110', arrive_iata: 'HND', iana_timezone: 'Asia/Tokyo' },
    },
    {
      trip_id: trip.id,
      type: 'lodging',
      title: 'Park Hotel Tokyo',
      start_at: '2026-03-14T16:00:00+09:00',
      end_at: '2026-03-16T10:00:00+09:00',
      start_location_id: tokyoHotel.id,
      source: 'manual',
      details: { property_name: 'Park Hotel Tokyo', nights: 2, iana_timezone: 'Asia/Tokyo' },
    },
    {
      trip_id: trip.id,
      type: 'transit',
      title: 'Shinkansen Tokyo → Kyoto',
      start_at: '2026-03-16T11:00:00+09:00',
      end_at: '2026-03-16T13:20:00+09:00',
      start_location_id: tokyoHotel.id,
      end_location_id: kyotoRyokan.id,
      source: 'manual',
      details: { mode: 'train', operator: 'JR', iana_timezone: 'Asia/Tokyo' },
    },
    {
      trip_id: trip.id,
      type: 'lodging',
      title: 'Kyoto Ryokan',
      start_at: '2026-03-16T15:00:00+09:00',
      end_at: '2026-03-18T10:00:00+09:00',
      start_location_id: kyotoRyokan.id,
      source: 'manual',
      details: { property_name: 'Kyoto Ryokan', nights: 2, iana_timezone: 'Asia/Tokyo' },
    },
    {
      trip_id: trip.id,
      type: 'activity',
      title: 'Fushimi Inari hike',
      start_at: '2026-03-17T09:00:00+09:00',
      start_location_id: fushimiInari.id,
      source: 'manual',
      details: { category: 'sightseeing', iana_timezone: 'Asia/Tokyo' },
    },
    {
      trip_id: trip.id,
      type: 'flight',
      title: 'NH 111 ITM → SEA',
      start_at: '2026-03-19T11:00:00+09:00',
      start_location_id: itmAirport.id,
      source: 'manual',
      details: { carrier: 'NH', flight_number: '111', depart_iata: 'ITM', iana_timezone: 'Asia/Tokyo' },
    },
  ];
  for (const input of inputs) {
    await createReservation(input);
  }

  const reservations = await listReservationsForTrip(trip.id);
  assertEqual(reservations.length, 6, 'six reservations persisted for the trip');

  const locationsById = new Map<string, Location>(
    [hndAirport, tokyoHotel, kyotoRyokan, fushimiInari, itmAirport].map((l) => [l.id, l]),
  );

  // --- Day derivation --------------------------------------------------------
  const days = buildItineraryDays(
    trip.start_date,
    trip.end_date,
    reservations,
    trip.home_timezone,
    locationsById,
  );
  assertEqual(days.length, 6, 'buildItineraryDays enumerates all six days inclusive');
  assertEqual(days[0]?.date, '2026-03-14', 'first day is the trip start date');
  assertEqual(days[5]?.date, '2026-03-19', 'last day is the trip end date');

  const dayByDate = new Map(days.map((d) => [d.date, d]));
  // Day 1: arrival flight + check-in lodging both intersect.
  const d14 = dayByDate.get('2026-03-14');
  assertEqual(d14?.reservations.length, 2, '03-14 has the arrival flight and lodging check-in');
  assertEqual(d14?.city, 'Tokyo', '03-14 is a Tokyo day (derived from lodging geocode)');
  assertEqual(d14?.lodging?.title, 'Park Hotel Tokyo', '03-14 lodging is the Tokyo hotel');

  // Day 3: checkout-day Tokyo lodging (end_at 03-16 still intersects), the
  // Shinkansen transit, and the Kyoto check-in lodging all intersect 03-16.
  const d16 = dayByDate.get('2026-03-16');
  assertEqual(d16?.reservations.length, 3, '03-16 has Tokyo checkout, transit, and Kyoto check-in');
  // deriveCity picks the first lodging on the day; both Tokyo (checkout) and
  // Kyoto (check-in) are present, so assert the city is one of the two.
  assert(d16?.city === 'Tokyo' || d16?.city === 'Kyoto', '03-16 city is a real lodging city');

  // Day 4: only the Kyoto ryokan + the Fushimi activity → Kyoto.
  const d17 = dayByDate.get('2026-03-17');
  assertEqual(d17?.city, 'Kyoto', '03-17 is a Kyoto day');
  assert(!!d17?.reservations.some((r) => r.type === 'activity'), '03-17 includes the activity');

  // Day 6: departure flight only, no lodging covering the night → Travel.
  const d19 = dayByDate.get('2026-03-19');
  assertEqual(d19?.lodging, undefined, '03-19 has no covering lodging');
  assertEqual(d19?.city, 'Osaka', '03-19 city derives from the departure flight location');
  assert(!!d19?.reservations.some((r) => r.type === 'flight'), '03-19 includes the departure flight');

  // --- City grouping ---------------------------------------------------------
  const groups = getCityGroups(days);
  const cityOrder = groups.map((g) => g.city).join(' > ');
  // Tokyo (14,15) → [16 is Tokyo-or-Kyoto] → Kyoto (17) → Osaka (19).
  assert(cityOrder.startsWith('Tokyo'), 'first city group is Tokyo');
  assert(cityOrder.includes('Kyoto'), 'a Kyoto city group exists');
  assert(cityOrder.endsWith('Osaka'), 'last city group is Osaka (departure)');
  const tokyoGroup = groups.find((g) => g.city === 'Tokyo');
  assert(!!tokyoGroup && tokyoGroup.days.length >= 2, 'Tokyo group spans at least the two Tokyo nights');
  assertEqual(tokyoGroup?.slug, 'tokyo', 'Tokyo group has a url-safe slug');

  // --- Multi-night "night N of M" -------------------------------------------
  const tokyoLodging = reservations.find((r) => r.title === 'Park Hotel Tokyo');
  assert(!!tokyoLodging, 'Tokyo lodging row present');
  if (tokyoLodging) {
    const n1 = nightOfM(tokyoLodging, '2026-03-14', trip.home_timezone);
    const n2 = nightOfM(tokyoLodging, '2026-03-15', trip.home_timezone);
    const nCheckout = nightOfM(tokyoLodging, '2026-03-16', trip.home_timezone);
    assertEqual(n1 ? `${n1.n}/${n1.m}` : null, '1/2', 'Tokyo 03-14 is night 1 of 2');
    assertEqual(n2 ? `${n2.n}/${n2.m}` : null, '2/2', 'Tokyo 03-15 is night 2 of 2');
    assertEqual(nCheckout, null, 'checkout morning (03-16) is not a Tokyo night');
  }

  // --- Transit pairs ---------------------------------------------------------
  // On 03-16, the Shinkansen runs Tokyo hotel → Kyoto ryokan; getTransitPairs
  // should emit that hop from the day's ordered reservations.
  const transitDayRes = (d16?.reservations ?? []).slice().sort((a, b) => a.start_at.localeCompare(b.start_at));
  const pairs = getTransitPairs(transitDayRes, locationsById);
  const hop = pairs.find((p) => p.from.includes('Park Hotel Tokyo') && p.to.includes('Kyoto Ryokan'));
  assert(!!hop, 'transit pair Tokyo hotel → Kyoto ryokan derived for 03-16');
  assertEqual(hop?.fromQuery, 'Park Hotel Tokyo, Tokyo, Japan', 'transit fromQuery is the hotel geocode');
  assertEqual(hop?.toQuery, 'Kyoto Ryokan, Kyoto, Japan', 'transit toQuery is the ryokan geocode');

  // --- Lifecycle teardown: delete cascades the trip away ---------------------
  await deleteTrip(trip.id);
  const gone = await getTrip(trip.id);
  assertEqual(gone, undefined, 'deleteTrip removes the trip');
  const orphaned = await listReservationsForTrip(trip.id);
  assertEqual(orphaned.length, 0, 'deleting the trip leaves no reservations behind (FK cascade)');
};
