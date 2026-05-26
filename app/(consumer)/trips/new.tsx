import { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, DateTimePicker, Input, Select } from '@/components/ui';
import { createTrip } from '@/services/trips';
import { TIMEZONE_OPTIONS } from '@/lib/timezones';

export default function NewTripScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<Date>(today());
  const [end, setEnd] = useState<Date>(addDays(today(), 7));
  const [tz, setTz] = useState<string | null>('America/Los_Angeles');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
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
      await createTrip({
        title: title.trim(),
        start_date: ymd(start),
        end_date: ymd(end),
        home_timezone: tz,
        cover_image_uri: null,
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [title, start, end, tz, router]);

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="p-4 gap-4">
        <Text className="font-serif text-3xl text-ink">New trip</Text>
        <Input label="Title" value={title} onChangeText={setTitle} placeholder="Japan 2026" />
        <DateTimePicker label="Start" mode="date" value={start} onChange={setStart} />
        <DateTimePicker label="End" mode="date" value={end} onChange={setEnd} />
        <Select label="Home timezone" value={tz} options={TIMEZONE_OPTIONS} onChange={setTz} />
        {error ? <Text className="text-sm text-accent-rust">{error}</Text> : null}
        <View className="mt-2 flex-row gap-3">
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          <Button title={busy ? 'Saving…' : 'Create'} onPress={submit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
