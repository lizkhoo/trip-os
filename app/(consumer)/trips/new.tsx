/**
 * Trip create screen (typecheck-gated; not the verification surface — the
 * trip-lifecycle e2e pathway owns correctness for createTrip + derivations).
 *
 * Calls the REAL createTrip with a home-timezone Select sourced from
 * src/lib/timezones.ts, then routes to the new trip's detail timeline.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, LocationAutocomplete, Select, DateTimePicker } from '@/components/ui';
import { getTimezoneOptions } from '@/lib/timezones';
import { createTrip } from '@/services/trips';

/** yyyy-mm-dd for an instant in the given IANA zone. */
function ymdInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${y}-${m}-${day}`;
}

export default function TripCreateScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [timezone, setTimezone] = useState('America/Los_Angeles');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  const onSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Give the trip a name.');
      return;
    }
    const start = ymdInZone(startDate, timezone);
    const end = ymdInZone(endDate, timezone);
    if (end < start) {
      Alert.alert('Invalid dates', 'The end date must be on or after the start date.');
      return;
    }
    setBusy(true);
    try {
      const trip = await createTrip({
        title: title.trim(),
        start_date: start,
        end_date: end,
        home_timezone: timezone,
      });
      router.replace({ pathname: '/trips/[id]', params: { id: trip.id } });
    } catch (err) {
      Alert.alert('Could not create trip', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [title, timezone, startDate, endDate, router]);

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'New trip' }} />

      <View className="gap-4">
        <LocationAutocomplete
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Anaheim, California"
          onSelectLocation={(loc) => setTimezone(loc.timezone)}
        />
        <Select
          label="Home timezone"
          value={timezone}
          options={timezoneOptions}
          onChange={setTimezone}
        />
        <DateTimePicker label="Starts" value={startDate} onChange={setStartDate} mode="date" />
        <DateTimePicker label="Ends" value={endDate} onChange={setEndDate} mode="date" />

        <View className="mt-2">
          <Button title={busy ? 'Creating…' : 'Create trip'} onPress={onSave} disabled={busy} />
        </View>
      </View>
    </ScrollView>
  );
}
