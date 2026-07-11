import { useCallback, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useFocusEffect, useRouter, Link, Stack } from 'expo-router';
import { Button, Card, EmptyState, PullToRefresh } from '@/components/ui';
import { listTrips } from '@/services/trips';
import type { Trip } from '@/domain/trip';

export default function TripsIndex() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);

  const refresh = useCallback(async () => {
    const ts = await listTrips();
    setTrips(ts);
  }, []);

  const syncGmail = useCallback(async () => {
    try {
      // Agent 2's module may not exist yet — swallow any failure.
      const m = await import('@/services/syncGmail');
      await m.runGmailSync();
    } catch {
      /* gmail vertical not wired yet */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void syncGmail();
    }, [refresh, syncGmail]),
  );

  const onRefresh = useCallback(async () => {
    await syncGmail();
    await refresh();
  }, [refresh, syncGmail]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Trips',
          // Empty state already has its own primary CTA — avoid duplicate "+ New".
          headerRight:
            trips.length === 0
              ? undefined
              : () => (
                  <Pressable onPress={() => router.push('/trips/new')} hitSlop={8}>
                    <Text style={{ color: '#b04a2a', fontSize: 17 }}>+ New</Text>
                  </Pressable>
                ),
        }}
      />
      <PullToRefresh
        onRefresh={onRefresh}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}
      >
        {trips.length === 0 ? (
          <EmptyState
            title="No trips yet"
            description="Create one, or connect Gmail to import existing confirmations."
            action={
              <Button title="+ New trip" onPress={() => router.push('/trips/new')} />
            }
          />
        ) : (
          trips.map((t) => <TripRow key={t.id} trip={t} />)
        )}

        <View className="mt-8 gap-1 items-center border-t border-paper-dim pt-4">
          <Link href="/settings" asChild>
            <Button title="Settings (Anthropic key)" variant="ghost" size="sm" />
          </Link>
          <Link href="/connect" asChild>
            <Button title="Connect Gmail" variant="ghost" size="sm" />
          </Link>
          <Link href="/dev" asChild>
            <Button title="Dev tools / load sample" variant="ghost" size="sm" />
          </Link>
        </View>
      </PullToRefresh>
    </>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <Link href={{ pathname: '/trips/[id]', params: { id: trip.id } }} asChild>
      <Pressable className="mb-4">
        <Card className="overflow-hidden p-0">
          {trip.cover_image_uri ? (
            <Image
              source={{ uri: trip.cover_image_uri }}
              style={{ width: '100%', height: 140 }}
              resizeMode="cover"
            />
          ) : null}
          <View className="p-4">
            <Text className="font-serif text-2xl text-ink">{trip.title}</Text>
            <Text className="text-xs uppercase tracking-widest text-ink-muted mt-1">
              {formatRange(trip.start_date, trip.end_date)} · {trip.home_timezone}
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

function formatRange(start: string, end: string): string {
  // Both inputs are yyyy-mm-dd in the trip's home zone. Render as "Mar 14 – Mar 28, 2026".
  const s = parseYmd(start);
  const e = parseYmd(end);
  if (!s || !e) return `${start} – ${end}`;
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const month = (d: Date) =>
    d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return sameYear
    ? `${month(s)} – ${month(e)}, ${e.getUTCFullYear()}`
    : `${month(s)} ${s.getUTCFullYear()} – ${month(e)} ${e.getUTCFullYear()}`;
}

function parseYmd(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}
