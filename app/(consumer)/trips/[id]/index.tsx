import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Linking, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  DayHeader,
  EmptyState,
  PullToRefresh,
  ReservationBadge,
  Timeline,
  BottomSheet,
  type BottomSheetHandle,
  type TimelineItem,
} from '@/components/ui';
import { getTrip } from '@/services/trips';
import { listReservationsForTrip } from '@/services/reservations';
import { listLocationsByIds } from '@/services/locations';
import type { Trip } from '@/domain/trip';
import type { Reservation } from '@/domain/reservation';
import type { Location } from '@/domain/location';
import {
  appleMapsDirectionsUrl,
  buildItineraryDays,
  getCityGroups,
  getTransitPairs,
  googleMapsDirectionsUrl,
  nightOfM,
  type CityGroup,
  type ItineraryDay,
  type TransitPair,
} from '@/lib/itinerary';
import { dateInZone } from '@/lib/time';

export default function TripDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = params.id;
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [locById, setLocById] = useState<Map<string, Location>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const sheet = useRef<BottomSheetHandle>(null);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    const t = await getTrip(tripId);
    if (!t) {
      setTrip(null);
      setLoading(false);
      return;
    }
    const rs = await listReservationsForTrip(tripId);
    const ids = new Set<string>();
    for (const r of rs) {
      if (r.start_location_id) ids.add(r.start_location_id);
      if (r.end_location_id) ids.add(r.end_location_id);
    }
    const locs = await listLocationsByIds([...ids]);
    setTrip(t);
    setReservations(rs);
    setLocById(new Map(locs.map((l) => [l.id, l])));
    setLoading(false);
  }, [tripId]);

  const syncGmail = useCallback(async () => {
    try {
      const m = await import('@/services/syncGmail');
      await m.runGmailSync();
    } catch {
      /* gmail vertical not wired yet */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onRefresh = useCallback(async () => {
    await syncGmail();
    await refresh();
  }, [refresh, syncGmail]);

  const groups = useMemo<CityGroup[]>(() => {
    if (!trip) return [];
    const days = buildItineraryDays(
      trip.start_date,
      trip.end_date,
      reservations,
      trip.home_timezone,
      locById,
    );
    return getCityGroups(days);
  }, [trip, reservations, locById]);

  const openDetail = useCallback((r: Reservation) => {
    setSelected(r);
    sheet.current?.expand();
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-paper items-center justify-center">
        <ActivityIndicator color="#1f1a17" />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <EmptyState title="Trip not found" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <Stack.Screen options={{ title: trip.title, headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
        <Pressable
          onPress={() => router.back()}
          className="px-2 py-1"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text className="text-base text-ink-soft">‹ Trips</Text>
        </Pressable>
        <View className="flex-row gap-2">
          <Button
            title="Map"
            size="sm"
            variant="secondary"
            onPress={() => router.push({ pathname: '/trips/[id]/map', params: { id: trip.id } })}
          />
          <Button
            title="Edit"
            size="sm"
            variant="ghost"
            onPress={() => router.push({ pathname: '/trips/[id]/edit', params: { id: trip.id } })}
          />
        </View>
      </View>

      <PullToRefresh
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
      >
        <View className="mb-4">
          <Text className="font-serif text-4xl text-ink">{trip.title}</Text>
          <Text className="text-xs uppercase tracking-widest text-ink-muted mt-1">
            {trip.start_date} – {trip.end_date} · {trip.home_timezone}
          </Text>
        </View>

        {groups.length === 0 || groups.every((g) => g.days.length === 0) ? (
          <EmptyState
            title="No reservations yet"
            description="Pull down to sync from Gmail, or add one manually."
          />
        ) : (
          groups.map((group) => (
            <CitySegment
              key={group.slug}
              group={group}
              homeTimezone={trip.home_timezone}
              locById={locById}
              onSelect={openDetail}
            />
          ))
        )}
      </PullToRefresh>

      <BottomSheet ref={sheet}>
        {selected ? (
          <ReservationDetail
            reservation={selected}
            locById={locById}
            onEdit={() => {
              sheet.current?.close();
              router.push({
                pathname: '/trips/[id]/edit',
                params: { id: trip.id, reservationId: selected.id },
              });
            }}
          />
        ) : (
          <View />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

interface CitySegmentProps {
  group: CityGroup;
  homeTimezone: string;
  locById: Map<string, Location>;
  onSelect: (r: Reservation) => void;
}

function CitySegment({ group, homeTimezone, locById, onSelect }: CitySegmentProps) {
  // The previous day's anchor lives just outside the segment's first day; we let each day
  // resolve its own transit pairs by looking back one day inside the segment.
  return (
    <View className="mb-6">
      <View className="flex-row items-baseline gap-2 mb-2 px-1">
        <Text className="font-serif text-2xl text-ink">{group.city}</Text>
        <Text className="text-xs uppercase tracking-widest text-ink-muted">
          {group.days.length} {group.days.length === 1 ? 'day' : 'days'}
        </Text>
      </View>
      {group.days.map((day, i) => {
        const prev = i > 0 ? group.days[i - 1] : undefined;
        const prevAnchor = prev?.lodging ? lodgingAnchor(prev.lodging, locById) : undefined;
        const pairs = getTransitPairs(day.reservations, locById, prevAnchor);
        return (
          <DayBlock
            key={day.date}
            day={day}
            pairs={pairs}
            homeTimezone={homeTimezone}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}

function lodgingAnchor(
  lodging: Reservation,
  locById: Map<string, Location>,
): { name: string; query: string } | undefined {
  const id = lodging.start_location_id ?? lodging.end_location_id;
  if (!id) return undefined;
  const loc = locById.get(id);
  if (!loc) return undefined;
  return { name: loc.name, query: loc.geocode_query };
}

interface DayBlockProps {
  day: ItineraryDay;
  pairs: TransitPair[];
  homeTimezone: string;
  onSelect: (r: Reservation) => void;
}

function DayBlock({ day, pairs, homeTimezone, onSelect }: DayBlockProps) {
  const d = parseYmd(day.date);
  const weekday = d?.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) ?? '';
  const dateLabel =
    d?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) ?? day.date;

  // Order reservations by start_at; multi-night lodging slots get a single "Night N of M" row.
  const sorted = [...day.reservations].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const items: TimelineItem[] = sorted.map((r) => buildItem(r, day.date, homeTimezone));

  return (
    <Card className="mb-3">
      <DayHeader
        date={dateLabel}
        weekday={weekday}
        rightAccessory={
          day.lodging ? <NightPill lodging={day.lodging} date={day.date} tz={homeTimezone} /> : null
        }
      />
      {items.length === 0 ? (
        <Text className="text-sm text-ink-muted px-1 pb-3">Nothing scheduled.</Text>
      ) : (
        <View>
          {sorted.map((r, idx) => {
            const item = items[idx];
            if (!item) return null;
            return (
              <Pressable key={r.id} onPress={() => onSelect(r)}>
                <Timeline items={[item]} />
              </Pressable>
            );
          })}
        </View>
      )}
      {pairs.length > 0 ? <TransitLinks pairs={pairs} /> : null}
    </Card>
  );
}

function NightPill({
  lodging,
  date,
  tz,
}: {
  lodging: Reservation;
  date: string;
  tz: string;
}) {
  const n = nightOfM(lodging, date, tz);
  if (!n || n.m < 2) return null;
  return (
    <View className="self-end rounded-full bg-paper-warm px-2.5 py-0.5">
      <Text className="text-[10px] uppercase tracking-wider text-ink-soft">
        Night {n.n} of {n.m}
      </Text>
    </View>
  );
}

function TransitLinks({ pairs }: { pairs: TransitPair[] }) {
  return (
    <View className="mt-2 border-t border-paper-dim pt-3 gap-2">
      {pairs.map((p, i) => (
        <Pressable
          key={`${p.fromQuery}->${p.toQuery}-${i}`}
          onPress={() => openMaps(p.fromQuery, p.toQuery)}
          className="flex-row items-center justify-between"
          accessibilityRole="link"
        >
          <View className="flex-1 pr-2">
            <Text className="text-xs uppercase tracking-wider text-ink-muted">Directions</Text>
            <Text className="text-sm text-ink mt-0.5" numberOfLines={1}>
              {p.from} → {p.to}
            </Text>
          </View>
          <Text className="text-sm text-accent-slate">Open ›</Text>
        </Pressable>
      ))}
    </View>
  );
}

async function openMaps(from: string, to: string): Promise<void> {
  const apple = appleMapsDirectionsUrl(from, to);
  const supported = await Linking.canOpenURL(apple);
  if (supported) {
    await Linking.openURL(apple);
    return;
  }
  await Linking.openURL(googleMapsDirectionsUrl(from, to));
}

function buildItem(r: Reservation, date: string, tz: string): TimelineItem {
  const isLodging = r.type === 'lodging';
  const startDay = dateInZone(r.start_at, tz);
  const checkInToday = isLodging && startDay === date;
  const detail = describe(r, checkInToday);
  return {
    id: r.id,
    time: formatLocalTime(r.start_at, tz, isLodging && !checkInToday),
    title: r.title,
    detail,
    type: r.type,
  };
}

function describe(r: Reservation, checkInToday: boolean): string | undefined {
  switch (r.type) {
    case 'flight': {
      const { carrier, flight_number, depart_iata, arrive_iata } = r.details;
      const route = depart_iata && arrive_iata ? ` · ${depart_iata} → ${arrive_iata}` : '';
      return `${carrier} ${flight_number}${route}`;
    }
    case 'lodging': {
      return checkInToday ? 'Check-in' : r.details.room_type ?? undefined;
    }
    case 'transit': {
      const { departure_station, arrival_station, operator } = r.details;
      const route =
        departure_station && arrival_station ? `${departure_station} → ${arrival_station}` : undefined;
      return route ?? operator;
    }
    case 'dining':
      return r.details.cuisine;
    case 'activity':
      return r.details.operator ?? r.details.category;
  }
}

function formatLocalTime(iso: string, tz: string, omit: boolean): string {
  if (omit) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
  } catch {
    return '';
  }
}

function parseYmd(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}

function ReservationDetail({
  reservation,
  locById,
  onEdit,
}: {
  reservation: Reservation;
  locById: Map<string, Location>;
  onEdit: () => void;
}) {
  const startLoc = reservation.start_location_id
    ? locById.get(reservation.start_location_id)
    : undefined;
  const endLoc = reservation.end_location_id
    ? locById.get(reservation.end_location_id)
    : undefined;
  return (
    <View className="pt-2">
      <View className="flex-row items-center gap-2 mb-2">
        <ReservationBadge type={reservation.type} />
        {reservation.confirmation_code ? (
          <Text className="text-xs uppercase tracking-wider text-ink-muted">
            {reservation.confirmation_code}
          </Text>
        ) : null}
      </View>
      <Text className="font-serif text-2xl text-ink">{reservation.title}</Text>
      <Text className="text-sm text-ink-soft mt-1">
        {formatRangeIso(reservation.start_at, reservation.end_at, reservation.details.iana_timezone)}
      </Text>
      {startLoc ? (
        <View className="mt-3">
          <Text className="text-xs uppercase tracking-wider text-ink-muted">From</Text>
          <Text className="text-sm text-ink">{startLoc.name}</Text>
        </View>
      ) : null}
      {endLoc && endLoc.id !== startLoc?.id ? (
        <View className="mt-2">
          <Text className="text-xs uppercase tracking-wider text-ink-muted">To</Text>
          <Text className="text-sm text-ink">{endLoc.name}</Text>
        </View>
      ) : null}
      <View className="mt-4">
        <Button title="Edit" onPress={onEdit} />
      </View>
    </View>
  );
}

function formatRangeIso(start: string, end: string | null | undefined, tz: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
  if (!end) return fmt(start);
  return `${fmt(start)} → ${fmt(end)}`;
}
