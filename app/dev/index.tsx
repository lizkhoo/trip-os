import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Link } from 'expo-router';
import { Button, Card, EmptyState } from '@/components/ui';
import { listTrips } from '@/services/trips';
import { listReservationsForTrip } from '@/services/reservations';
import { runSeed } from '../../scripts/seed';
import type { Trip } from '@/domain/trip';

export default function DevHome() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const ts = await listTrips();
    setTrips(ts);
    const out: Record<string, number> = {};
    for (const t of ts) {
      const r = await listReservationsForTrip(t.id);
      out[t.id] = r.length;
    }
    setCounts(out);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reseed = useCallback(async () => {
    setBusy(true);
    try {
      const summary = await runSeed();
      Alert.alert('Seed complete', `${summary.reservations} reservations across 1 trip.`);
      await refresh();
    } catch (e) {
      Alert.alert('Seed failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <ScrollView className="flex-1 bg-paper px-4">
      <Text className="font-serif text-3xl text-ink mt-4 mb-2">Foundation dev</Text>
      <Text className="text-sm text-ink-muted mb-4">
        Verifies DB migrations applied, services work, primitives render. No consumer UI yet.
      </Text>

      <Card className="mb-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">Trips</Text>
        {trips.length === 0 ? (
          <EmptyState
            title="No trips yet"
            description="Tap re-seed to load the Japan 2026 fixture."
            action={<Button title={busy ? 'Seeding…' : 'Re-run seed'} onPress={reseed} />}
          />
        ) : (
          <>
            {trips.map((t) => (
              <View key={t.id} className="py-2 border-b border-paper-dim last:border-b-0">
                <Text className="text-base text-ink">{t.title}</Text>
                <Text className="text-xs text-ink-muted">
                  {t.start_date} – {t.end_date} · {t.home_timezone} · {counts[t.id] ?? 0}{' '}
                  reservations
                </Text>
              </View>
            ))}
            <View className="mt-3">
              <Button
                title={busy ? 'Seeding…' : 'Re-run seed'}
                variant="secondary"
                onPress={reseed}
              />
            </View>
          </>
        )}
      </Card>

      <Link href="/dev/primitives" asChild>
        <Button title="Open primitives showcase" variant="secondary" />
      </Link>
    </ScrollView>
  );
}
