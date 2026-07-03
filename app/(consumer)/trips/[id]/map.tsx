/**
 * Trip map (typecheck-gated; needs a device/simulator to render — MapKit via
 * react-native-maps).
 *
 * Shows every reservation location for the trip as a type-coded marker. On
 * load it runs the REAL geocodeMissingLocations() backfill (CLGeocoder via
 * expo-location — on-device, no API key) so locations gain lat/lng the first
 * time the map is opened. Locations that still can't be geocoded are listed
 * below the map with their Maps-URL search link as a fallback.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState } from '@/components/ui';
import { getTrip } from '@/services/trips';
import { listReservationsForTrip } from '@/services/reservations';
import { geocodeMissingLocations } from '@/services/geocode';
import { getDb } from '@/db/client';
import { locations as locationsTable } from '@/db/schema';
import type { Location } from '@/domain/location';
import type { Reservation, ReservationType } from '@/domain/reservation';

const MARKER_COLORS: Record<ReservationType, string> = {
  flight: '#4a5d6e',
  lodging: '#b04a2a',
  dining: '#c98a3a',
  activity: '#3f6b4e',
  transit: '#7a3b56',
};

interface Pin {
  location: Location;
  /** Type of the first reservation touching this location — drives marker color. */
  type: ReservationType;
  /** Titles of every reservation at this location, for the callout. */
  titles: string[];
}

interface LoadedMap {
  tripTitle: string;
  pins: Pin[];
  ungeocoded: Array<{ location: Location; titles: string[] }>;
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

function collectPins(
  reservations: Reservation[],
  locationsById: Map<string, Location>,
): { pins: Pin[]; ungeocoded: Array<{ location: Location; titles: string[] }> } {
  const byLocation = new Map<string, { location: Location; type: ReservationType; titles: string[] }>();
  const sorted = [...reservations].sort((a, b) => a.start_at.localeCompare(b.start_at));
  for (const r of sorted) {
    for (const locId of [r.start_location_id, r.end_location_id]) {
      if (!locId) continue;
      const location = locationsById.get(locId);
      if (!location) continue;
      const entry = byLocation.get(locId);
      if (entry) {
        if (!entry.titles.includes(r.title)) entry.titles.push(r.title);
      } else {
        byLocation.set(locId, { location, type: r.type, titles: [r.title] });
      }
    }
  }
  const pins: Pin[] = [];
  const ungeocoded: Array<{ location: Location; titles: string[] }> = [];
  for (const entry of byLocation.values()) {
    if (typeof entry.location.lat === 'number' && typeof entry.location.lng === 'number') {
      pins.push(entry);
    } else {
      ungeocoded.push({ location: entry.location, titles: entry.titles });
    }
  }
  return { pins, ungeocoded };
}

function mapsSearchUrl(query: string): string {
  return `maps://?q=${encodeURIComponent(query)}`;
}

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof id !== 'string') return;
    const trip = await getTrip(id);
    if (!trip) {
      setLoaded(null);
      setLoading(false);
      return;
    }
    // Backfill lat/lng for anything not yet geocoded. Individual failures are
    // non-fatal — those locations land in the "ungeocoded" fallback list.
    try {
      await geocodeMissingLocations();
    } catch {
      // Geocoder unavailable (e.g. no network for the region download) — the
      // map still renders whatever already has coordinates.
    }
    const reservations = await listReservationsForTrip(id);
    const locationsById = await loadAllLocations();
    const { pins, ungeocoded } = collectPins(reservations, locationsById);
    setLoaded({ tripTitle: trip.title, pins, ungeocoded });
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const region = useMemo(() => {
    if (!loaded || loaded.pins.length === 0) return undefined;
    const lats = loaded.pins.map((p) => p.location.lat as number);
    const lngs = loaded.pins.map((p) => p.location.lng as number);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.05, (maxLng - minLng) * 1.4),
    };
  }, [loaded]);

  if (loading) {
    return (
      <View className="flex-1 bg-paper items-center justify-center">
        <Stack.Screen options={{ title: 'Map' }} />
        <ActivityIndicator color="#6b6058" />
      </View>
    );
  }

  if (!loaded) {
    return (
      <View className="flex-1 bg-paper">
        <Stack.Screen options={{ title: 'Map' }} />
        <EmptyState title="Trip not found" />
      </View>
    );
  }

  if (loaded.pins.length === 0 && loaded.ungeocoded.length === 0) {
    return (
      <View className="flex-1 bg-paper">
        <Stack.Screen options={{ title: loaded.tripTitle }} />
        <EmptyState
          title="No locations yet"
          description="Reservations with locations will appear here as pins."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-paper">
      <Stack.Screen options={{ title: loaded.tripTitle }} />
      {loaded.pins.length > 0 ? (
        <MapView style={{ flex: 1 }} initialRegion={region}>
          {loaded.pins.map((pin) => (
            <Marker
              key={pin.location.id}
              coordinate={{
                latitude: pin.location.lat as number,
                longitude: pin.location.lng as number,
              }}
              pinColor={MARKER_COLORS[pin.type]}
            >
              <Callout onPress={() => Linking.openURL(mapsSearchUrl(pin.location.geocode_query))}>
                <View style={{ maxWidth: 220, padding: 4 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 2 }}>{pin.location.name}</Text>
                  {pin.titles.slice(0, 3).map((t) => (
                    <Text key={t} style={{ fontSize: 12, color: '#6b6058' }}>
                      {t}
                    </Text>
                  ))}
                  <Text style={{ fontSize: 12, color: '#b04a2a', marginTop: 2 }}>Open in Maps</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      ) : null}

      {loaded.ungeocoded.length > 0 ? (
        <ScrollView
          className="bg-paper px-4"
          style={{ maxHeight: 220 }}
          contentContainerStyle={{ paddingVertical: 12 }}
        >
          <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
            Couldn&apos;t place on the map
          </Text>
          {loaded.ungeocoded.map(({ location, titles }) => (
            <Card key={location.id} className="mb-2 p-3">
              <Text className="text-ink font-semibold">{location.name}</Text>
              <Text className="text-ink-muted text-xs mb-2">{titles.join(' · ')}</Text>
              <Button
                title="Search in Maps"
                variant="ghost"
                size="sm"
                onPress={() => Linking.openURL(mapsSearchUrl(location.geocode_query))}
              />
            </Card>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
