/**
 * Trip detail timeline (typecheck-gated; not the verification surface — the
 * trip-lifecycle e2e pathway owns correctness for the derivations used here).
 *
 * Loads the trip + REAL listReservationsForTrip + locations, derives day cards
 * via REAL buildItineraryDays / getCityGroups / nightOfM, and renders with the
 * Timeline / DayHeader / ReservationBadge / ConfidenceChip primitives:
 *   - one card per day, grouped under city headers,
 *   - a "night N of M" label on multi-night lodging,
 *   - a confidence chip on lower-confidence (non-manual) reservations.
 */
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  ConfidenceChip,
  DayHeader,
  EmptyState,
  PullToRefresh,
  Timeline,
  type TimelineItem,
} from '@/components/ui';
import { getTrip } from '@/services/trips';
import { listReservationsForTrip } from '@/services/reservations';
import { getDb } from '@/db/client';
import { locations as locationsTable } from '@/db/schema';
import {
  buildItineraryDays,
  getCityGroups,
  nightOfM,
  type ItineraryDay,
} from '@/lib/itinerary';
import type { Trip } from '@/domain/trip';
import type { Location } from '@/domain/location';
import type { Reservation } from '@/domain/reservation';

interface LoadedTrip {
  trip: Trip;
  days: ItineraryDay[];
  homeTimezone: string;
}

async function loadAllLocations(): Promise<Map<string, Location>> {
  const rows = await getDb().select().from(locationsTable);
  const map = new Map<string, Location>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      geocode_query: r.geocodeQuery,
      place_id: r.placeId,
      timezone: r.timezone,
    });
  }
  return map;
}

export default function TripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<LoadedTrip | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof id !== 'string') return;
    const trip = await getTrip(id);
    if (!trip) {
      setLoaded(null);
      setLoading(false);
      return;
    }
    const reservations = await listReservationsForTrip(id);
    const locationsById = await loadAllLocations();
    const days = buildItineraryDays(
      trip.start_date,
      trip.end_date,
      reservations,
      trip.home_timezone,
      locationsById,
    );
    setLoaded({ trip, days, homeTimezone: trip.home_timezone });
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (loading) {
    return (
      <View className="flex-1 bg-paper items-center justify-center">
        <Stack.Screen options={{ title: 'Trip' }} />
        <ActivityIndicator color="#6b6058" />
      </View>
    );
  }

  if (!loaded) {
    return (
      <View className="flex-1 bg-paper">
        <Stack.Screen options={{ title: 'Trip' }} />
        <EmptyState
          title="Trip not found"
          action={<Button title="Back" onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const { trip, days, homeTimezone } = loaded;
  const groups = getCityGroups(days);
  const isEmpty = days.every((d) => d.reservations.length === 0);

  return (
    <>
      <Stack.Screen
        options={{
          title: trip.title,
          headerRight: () => (
            <Pressable onPress={() => router.push('/review')} hitSlop={8}>
              <Text style={{ color: '#b04a2a', fontSize: 17 }}>Review</Text>
            </Pressable>
          ),
        }}
      />
      <PullToRefresh
        onRefresh={refresh}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}
      >
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-4">
          {trip.start_date} – {trip.end_date} · {homeTimezone}
        </Text>

        <View className="flex-row gap-2 mb-4">
          <Link
            href={{ pathname: '/reservations/edit', params: { tripId: trip.id } }}
            asChild
          >
            <Button title="+ Add" variant="secondary" size="sm" />
          </Link>
          <Link href="/upload" asChild>
            <Button title="Upload" variant="secondary" size="sm" />
          </Link>
          <Link href={{ pathname: '/trips/[id]/map', params: { id: trip.id } }} asChild>
            <Button title="Map" variant="secondary" size="sm" />
          </Link>
        </View>

        {isEmpty ? (
          <EmptyState
            title="No reservations yet"
            description="Add one manually, upload a screenshot, or sync Gmail from the home screen."
            action={
              <Link
                href={{ pathname: '/reservations/edit', params: { tripId: trip.id } }}
                asChild
              >
                <Button title="+ Add reservation" />
              </Link>
            }
          />
        ) : (
          groups.map((group) => (
            <View key={group.slug} className="mb-2">
              <Text className="font-serif text-xl text-ink-soft mt-4 mb-1">{group.city}</Text>
              {group.days
                .filter((d) => d.reservations.length > 0)
                .map((day) => (
                  <DayCard key={day.date} day={day} homeTimezone={homeTimezone} />
                ))}
            </View>
          ))
        )}
      </PullToRefresh>
    </>
  );
}

function DayCard({ day, homeTimezone }: { day: ItineraryDay; homeTimezone: string }) {
  const sorted = [...day.reservations].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const items: TimelineItem[] = sorted.map((r) => ({
    id: r.id,
    time: timeInZone(r.start_at, homeTimezone),
    title: r.title,
    detail: reservationDetail(r, day, homeTimezone),
    type: r.type,
  }));

  const lodgingLabel = day.lodging ? nightLabel(day.lodging, day.date, homeTimezone) : null;

  return (
    <Card className="mb-3 p-0">
      <View className="px-4 pt-2">
        <DayHeader
          date={formatDayLabel(day.date)}
          weekday={weekdayInZone(day.date)}
          label={lodgingLabel ?? undefined}
          rightAccessory={<DayConfidence reservations={sorted} />}
        />
      </View>
      <View className="px-2 pb-3">
        <Timeline items={items} />
      </View>
    </Card>
  );
}

/** Show the lowest non-manual reservation confidence on the day, if any is uncertain. */
function DayConfidence({ reservations }: { reservations: Reservation[] }) {
  const uncertain = reservations
    .filter((r) => !r.manually_edited_at && typeof r.confidence === 'number' && r.confidence < 1)
    .map((r) => r.confidence as number);
  if (uncertain.length === 0) return null;
  return <ConfidenceChip value={Math.min(...uncertain)} />;
}

function nightLabel(
  lodging: Reservation,
  isoDate: string,
  homeTimezone: string,
): string | null {
  const nm = nightOfM(lodging, isoDate, homeTimezone);
  if (!nm) return null;
  return `Night ${nm.n} of ${nm.m}`;
}

function reservationDetail(
  r: Reservation,
  day: ItineraryDay,
  homeTimezone: string,
): string | undefined {
  const parts: string[] = [];
  if (r.type === 'flight') parts.push(`${r.details.carrier} ${r.details.flight_number}`);
  if (r.type === 'lodging') {
    const nm = nightOfM(r, day.date, homeTimezone);
    if (nm) parts.push(`Night ${nm.n} of ${nm.m}`);
  }
  if (r.confirmation_code) parts.push(`Conf ${r.confirmation_code}`);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Local hh:mm for an instant in the given IANA zone. */
function timeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function weekdayInZone(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' });
}
