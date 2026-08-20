/**
 * Manual add / edit reservation screen (typecheck-gated; not the verification
 * surface — the e2e pathway test owns correctness).
 *
 * Routes:
 *   /reservations/edit?tripId=<id>            → create a new manual reservation
 *   /reservations/edit?tripId=<id>&id=<resId> → edit an existing reservation
 *
 * Inline edits go through the REAL updateReservation with { manual: true } so the
 * re-sync edit-guard (manually_edited_at) protects user changes. Creates use the
 * REAL createReservation with source 'manual'; delete uses deleteReservation.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Input, Select, DateTimePicker, type SelectOption } from '@/components/ui';
import {
  createReservation,
  updateReservation,
  deleteReservation,
  getReservation,
} from '@/services/reservations';
import { getTrip } from '@/services/trips';
import { composeIso, localHm, localYmd, zonedWallClockAsLocalDate } from '@/lib/time';
import type { ReservationInput, ReservationType } from '@/domain/reservation';

const TYPE_OPTIONS: SelectOption<ReservationType>[] = [
  { value: 'flight', label: 'Flight' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'dining', label: 'Dining' },
  { value: 'activity', label: 'Activity' },
  { value: 'transit', label: 'Transit' },
];

export default function ReservationEditScreen() {
  const router = useRouter();
  const { tripId, id } = useLocalSearchParams<{ tripId?: string; id?: string }>();
  const isEditing = typeof id === 'string' && id.length > 0;

  const [timezone, setTimezone] = useState('UTC');
  const [type, setType] = useState<ReservationType>('flight');
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  // Type-specific detail fields (only the relevant ones are read on save).
  const [carrier, setCarrier] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [operator, setOperator] = useState('');
  const [busy, setBusy] = useState(false);

  // Load the trip's home timezone (and the reservation when editing).
  useEffect(() => {
    let active = true;
    void (async () => {
      // Resolve the zone first: the pickers below are populated with the
      // wall-clock as read IN this zone, so loading them before it is known
      // would render the reservation at the device's offset instead.
      let zone = 'UTC';
      if (typeof tripId === 'string') {
        const trip = await getTrip(tripId);
        if (!active) return;
        if (trip) {
          zone = trip.home_timezone;
          setTimezone(zone);
        }
      }
      if (isEditing && typeof id === 'string') {
        const res = await getReservation(id);
        if (!active || !res) return;
        setType(res.type);
        setTitle(res.title);
        setStartAt(zonedWallClockAsLocalDate(res.start_at, zone));
        setEndAt(res.end_at ? zonedWallClockAsLocalDate(res.end_at, zone) : null);
        setConfirmationCode(res.confirmation_code ?? '');
        if (res.type === 'flight') {
          setCarrier(res.details.carrier);
          setFlightNumber(res.details.flight_number);
        } else if (res.type === 'lodging') {
          setPropertyName(res.details.property_name);
        } else if (res.type === 'transit') {
          setOperator(res.details.operator ?? '');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [tripId, id, isEditing]);

  const buildInput = useCallback((): ReservationInput | null => {
    if (typeof tripId !== 'string' || tripId.length === 0) {
      Alert.alert('Missing trip', 'No trip selected for this reservation.');
      return null;
    }
    if (!title.trim()) {
      Alert.alert('Missing title', 'Give the reservation a title.');
      return null;
    }
    // The picker shows device-local wall-clock; the timezone Select says which
    // zone those digits belong to. Converting the instant into `timezone` first
    // would shift the user's typed time by the offset between the two zones.
    const start_at = composeIso(
      localYmd(startAt),
      localHm(startAt),
      timezone,
    );
    const end_at = endAt
      ? composeIso(localYmd(endAt), localHm(endAt), timezone)
      : null;
    const base = {
      trip_id: tripId,
      title: title.trim(),
      start_at,
      end_at,
      source: 'manual' as const,
      confirmation_code: confirmationCode.trim() || null,
    };
    switch (type) {
      case 'flight':
        return {
          ...base,
          type: 'flight',
          details: {
            carrier: carrier.trim() || 'Unknown',
            flight_number: flightNumber.trim() || '—',
            iana_timezone: timezone,
          },
        } satisfies ReservationInput;
      case 'lodging':
        return {
          ...base,
          type: 'lodging',
          details: { property_name: propertyName.trim() || title.trim(), iana_timezone: timezone },
        } satisfies ReservationInput;
      case 'dining':
        return { ...base, type: 'dining', details: { iana_timezone: timezone } } satisfies ReservationInput;
      case 'activity':
        return { ...base, type: 'activity', details: { iana_timezone: timezone } } satisfies ReservationInput;
      case 'transit':
        return {
          ...base,
          type: 'transit',
          details: { mode: 'other', operator: operator.trim() || undefined, iana_timezone: timezone },
        } satisfies ReservationInput;
    }
  }, [
    tripId,
    title,
    startAt,
    endAt,
    timezone,
    type,
    carrier,
    flightNumber,
    propertyName,
    operator,
    confirmationCode,
  ]);

  const onSave = useCallback(async () => {
    const input = buildInput();
    if (!input) return;
    setBusy(true);
    try {
      if (isEditing && typeof id === 'string') {
        // Inline user edit → manual:true so the re-sync edit-guard protects it.
        await updateReservation(id, input, { manual: true });
      } else {
        await createReservation(input);
      }
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [buildInput, isEditing, id, router]);

  const onDelete = useCallback(async () => {
    if (!isEditing || typeof id !== 'string') return;
    setBusy(true);
    try {
      await deleteReservation(id);
      router.back();
    } catch (err) {
      Alert.alert('Could not delete', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [isEditing, id, router]);

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: isEditing ? 'Edit reservation' : 'Add reservation' }} />

      <View className="gap-4">
        <Select<ReservationType>
          label="Type"
          value={type}
          options={TYPE_OPTIONS}
          onChange={setType}
        />
        <Input label="Title" value={title} onChangeText={setTitle} placeholder="NH 110 HND → ITM" />
        <DateTimePicker label="Starts" value={startAt} onChange={setStartAt} mode="datetime" />
        <DateTimePicker
          label="Ends (optional)"
          value={endAt ?? startAt}
          onChange={setEndAt}
          mode="datetime"
        />

        {type === 'flight' ? (
          <View className="gap-4">
            <Input label="Carrier" value={carrier} onChangeText={setCarrier} placeholder="NH" />
            <Input
              label="Flight number"
              value={flightNumber}
              onChangeText={setFlightNumber}
              placeholder="110"
            />
          </View>
        ) : null}
        {type === 'lodging' ? (
          <Input
            label="Property name"
            value={propertyName}
            onChangeText={setPropertyName}
            placeholder="Park Hotel Tokyo"
          />
        ) : null}
        {type === 'transit' ? (
          <Input label="Operator" value={operator} onChangeText={setOperator} placeholder="JR" />
        ) : null}

        <Input
          label="Confirmation code (optional)"
          value={confirmationCode}
          onChangeText={setConfirmationCode}
          autoCapitalize="characters"
        />

        <View className="mt-2 gap-2">
          <Button title={busy ? 'Saving…' : 'Save'} onPress={onSave} disabled={busy} />
          {isEditing ? (
            <Button title="Delete" variant="ghost" onPress={onDelete} disabled={busy} />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

/** Local hh:mm for an instant in the given IANA zone. */
