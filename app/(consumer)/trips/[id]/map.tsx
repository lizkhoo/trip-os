import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BottomSheet,
  Button,
  EmptyState,
  ReservationBadge,
  type BottomSheetHandle,
} from '@/components/ui';
import { getTrip } from '@/services/trips';
import { listReservationsForTrip } from '@/services/reservations';
import { listLocationsByIds } from '@/services/locations';
import type { Location } from '@/domain/location';
import type { Reservation, ReservationType } from '@/domain/reservation';

const PIN_COLOR: Record<ReservationType, string> = {
  flight: '#4a5d6e',
  lodging: '#b04a2a',
  dining: '#c98a3a',
  activity: '#3f6b4e',
  transit: '#7a3b56',
};

interface Pin {
  id: string;
  lat: number;
  lng: number;
  loc: Location;
  reservations: Reservation[];
}

export default function TripMap() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [selected, setSelected] = useState<Pin | null>(null);
  const sheet = useRef<BottomSheetHandle>(null);

  useEffect(() => {
    if (!params.id) return;
    void (async () => {
      const t = await getTrip(params.id);
      if (!t) {
        setLoading(false);
        return;
      }
      const rs = await listReservationsForTrip(params.id);
      const ids = new Set<string>();
      for (const r of rs) {
        if (r.start_location_id) ids.add(r.start_location_id);
        if (r.end_location_id) ids.add(r.end_location_id);
      }
      const locs = await listLocationsByIds([...ids]);
      const locById = new Map(locs.map((l) => [l.id, l]));
      const byLoc = new Map<string, Pin>();
      for (const r of rs) {
        for (const lid of [r.start_location_id, r.end_location_id]) {
          if (!lid) continue;
          const loc = locById.get(lid);
          if (!loc || loc.lat == null || loc.lng == null) continue;
          const existing = byLoc.get(loc.id);
          if (existing) {
            existing.reservations.push(r);
          } else {
            byLoc.set(loc.id, {
              id: loc.id,
              lat: loc.lat,
              lng: loc.lng,
              loc,
              reservations: [r],
            });
          }
        }
      }
      const next = [...byLoc.values()];
      setPins(next);
      if (next.length > 0) {
        setRegion(boundingRegion(next));
      }
      setLoading(false);
    })();
  }, [params.id]);

  const onMarker = useCallback((p: Pin) => {
    setSelected(p);
    sheet.current?.expand();
  }, []);

  if (loading) return <SafeAreaView className="flex-1 bg-paper" />;

  if (pins.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <Stack.Screen options={{ title: 'Map' }} />
        <EmptyState
          title="No geocoded locations yet"
          description="Locations will appear here once they have coordinates."
          action={<Button title="Back" onPress={() => router.back()} />}
        />
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-paper">
      <Stack.Screen options={{ title: 'Map' }} />
      <MapView style={{ flex: 1 }} initialRegion={region ?? undefined}>
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.loc.name}
            pinColor={PIN_COLOR[p.reservations[0]?.type ?? 'activity']}
            onPress={() => onMarker(p)}
          />
        ))}
      </MapView>
      <BottomSheet ref={sheet}>
        {selected ? <PinDetail pin={selected} /> : <View />}
      </BottomSheet>
    </View>
  );
}

function PinDetail({ pin }: { pin: Pin }) {
  return (
    <View className="pt-2">
      <Text className="font-serif text-2xl text-ink">{pin.loc.name}</Text>
      {pin.loc.address ? (
        <Text className="text-sm text-ink-soft mt-1">{pin.loc.address}</Text>
      ) : null}
      <View className="mt-3 gap-2">
        {pin.reservations.map((r) => (
          <View key={r.id} className="flex-row items-center gap-2">
            <ReservationBadge type={r.type} />
            <Text className="text-sm text-ink flex-1">{r.title}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function boundingRegion(pins: Pin[]): Region {
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max(0.05, (maxLat - minLat) * 1.4);
  const lngDelta = Math.max(0.05, (maxLng - minLng) * 1.4);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}
