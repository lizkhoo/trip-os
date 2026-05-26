import { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, DateTimePicker, Input, Select } from '@/components/ui';
import { getTrip } from '@/services/trips';
import { db } from '@/db/client';
import { trips } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TIMEZONE_OPTIONS } from '@/lib/timezones';

export default function EditTripScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(new Date());
  const [tz, setTz] = useState<string | null>('America/Los_Angeles');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    void (async () => {
      const t = await getTrip(params.id);
      if (!t) return;
      setTitle(t.title);
      setStart(fromYmd(t.start_date));
      setEnd(fromYmd(t.end_date));
      setTz(t.home_timezone);
      setLoaded(true);
    })();
  }, [params.id]);

  const submit = useCallback(async () => {
    if (!params.id) return;
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!tz) {
      setError('Pick a home timezone');
      return;
    }
    setBusy(true);
    try {
      await db
        .update(trips)
        .set({
          title: title.trim(),
          startDate: ymd(start),
          endDate: ymd(end),
          homeTimezone: tz,
        })
        .where(eq(trips.id, params.id));
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [params.id, title, start, end, tz, router]);

  if (!loaded) {
    return <SafeAreaView className="flex-1 bg-paper" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="p-4 gap-4">
        <Text className="font-serif text-3xl text-ink">Edit trip</Text>
        <Input label="Title" value={title} onChangeText={setTitle} />
        <DateTimePicker label="Start" mode="date" value={start} onChange={setStart} />
        <DateTimePicker label="End" mode="date" value={end} onChange={setEnd} />
        <Select label="Home timezone" value={tz} options={TIMEZONE_OPTIONS} onChange={setTz} />
        {error ? <Text className="text-sm text-accent-rust">{error}</Text> : null}
        <View className="mt-2 flex-row gap-3">
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          <Button title={busy ? 'Saving…' : 'Save'} onPress={submit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromYmd(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
