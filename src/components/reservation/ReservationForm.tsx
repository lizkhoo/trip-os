import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Button, DateTimePicker, Input, Select, type SelectOption } from '@/components/ui';
import { composeIso } from '@/lib/time';
import { TIMEZONE_OPTIONS } from '@/lib/timezones';
import {
  ReservationInputSchema,
  type ReservationInput,
  type ReservationType,
} from '@/domain/reservation';
import { findOrCreateLocation, getLocation } from '@/services/locations';
import { getTrip } from '@/services/trips';

interface ReservationFormProps {
  tripId: string;
  initial?: Partial<ReservationInput>;
  /** Whether the type can be changed (false in edit mode). */
  typeLocked?: boolean;
  submitLabel?: string;
  onSubmit: (input: ReservationInput) => Promise<void>;
  onCancel: () => void;
}

const TYPE_OPTIONS: SelectOption<ReservationType>[] = [
  { value: 'flight', label: 'Flight' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'dining', label: 'Dining' },
  { value: 'activity', label: 'Activity' },
  { value: 'transit', label: 'Transit' },
];

export function ReservationForm({
  tripId,
  initial,
  typeLocked,
  submitLabel,
  onSubmit,
  onCancel,
}: ReservationFormProps) {
  const [type, setType] = useState<ReservationType>(initial?.type ?? 'activity');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tz, setTz] = useState<string>(initialTz(initial));
  const [start, setStart] = useState<Date>(initial?.start_at ? new Date(initial.start_at) : new Date());
  const [hasEnd, setHasEnd] = useState<boolean>(!!initial?.end_at);
  const [end, setEnd] = useState<Date>(initial?.end_at ? new Date(initial.end_at) : new Date());
  const [confirmationCode, setConfirmationCode] = useState<string>(initial?.confirmation_code ?? '');
  const [detailField, setDetailField] = useState<string>(initialDetailField(initial));
  const [startLocationName, setStartLocationName] = useState<string>('');
  const [endLocationName, setEndLocationName] = useState<string>('');
  const [tripTimezone, setTripTimezone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailLabel = useMemo(() => detailLabelFor(type), [type]);
  const showEndLocation = type === 'flight' || type === 'transit';

  // Resolve the trip's home timezone (location rows need a timezone) and the names of
  // any pre-existing locations the reservation already points at.
  useEffect(() => {
    void (async () => {
      const trip = await getTrip(tripId);
      if (trip) setTripTimezone(trip.home_timezone);
      if (initial?.start_location_id) {
        const loc = await getLocation(initial.start_location_id);
        if (loc) setStartLocationName(loc.name);
      }
      if (initial?.end_location_id) {
        const loc = await getLocation(initial.end_location_id);
        if (loc) setEndLocationName(loc.name);
      }
    })();
  }, [tripId, initial?.start_location_id, initial?.end_location_id]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    try {
      setBusy(true);
      const resolvedStartId = await resolveLocationId(
        startLocationName.trim(),
        initial?.start_location_id ?? null,
        tripTimezone,
      );
      const resolvedEndId = showEndLocation
        ? await resolveLocationId(
            endLocationName.trim(),
            initial?.end_location_id ?? null,
            tripTimezone,
          )
        : initial?.end_location_id ?? null;
      const input = ReservationInputSchema.parse({
        trip_id: tripId,
        type,
        title: title.trim(),
        start_at: composeIso(ymd(start), hm(start), tz),
        end_at: hasEnd ? composeIso(ymd(end), hm(end), tz) : null,
        start_location_id: resolvedStartId,
        end_location_id: resolvedEndId,
        confirmation_code: confirmationCode.trim() || null,
        source: initial?.source ?? 'manual',
        source_ref: initial?.source_ref ?? null,
        confidence: initial?.confidence ?? null,
        status: initial?.status ?? 'confirmed',
        details: buildDetails(type, detailField.trim(), tz),
      });
      await onSubmit(input);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      <Select
        label="Type"
        value={type}
        options={TYPE_OPTIONS}
        onChange={(v) => !typeLocked && setType(v)}
      />
      <Input label="Title" value={title} onChangeText={setTitle} />
      <Select label="Timezone" value={tz} options={TIMEZONE_OPTIONS} onChange={setTz} />
      <DateTimePicker label="Start" value={start} onChange={setStart} />
      <View className="flex-row gap-3 items-end">
        <View className="flex-1">
          <DateTimePicker label="End" value={end} onChange={setEnd} />
        </View>
        <Button
          title={hasEnd ? 'Clear end' : 'Add end'}
          variant="ghost"
          size="sm"
          onPress={() => setHasEnd((v) => !v)}
        />
      </View>
      {detailLabel ? (
        <Input
          label={detailLabel}
          value={detailField}
          onChangeText={setDetailField}
          autoCapitalize="none"
        />
      ) : null}
      <Input
        label="Location"
        value={startLocationName}
        onChangeText={setStartLocationName}
        placeholder="e.g. Tokyo Station"
      />
      {showEndLocation ? (
        <Input
          label="Destination"
          value={endLocationName}
          onChangeText={setEndLocationName}
          placeholder="e.g. Kyoto Station"
        />
      ) : null}
      <Input
        label="Confirmation code"
        value={confirmationCode}
        onChangeText={setConfirmationCode}
        autoCapitalize="characters"
      />
      {error ? <Text className="text-sm text-accent-rust">{error}</Text> : null}
      <View className="mt-2 flex-row gap-3">
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button title={busy ? 'Saving…' : submitLabel ?? 'Save'} onPress={submit} />
      </View>
    </View>
  );
}

function detailLabelFor(type: ReservationType): string | null {
  switch (type) {
    case 'flight':
      return 'Flight (e.g. AS 338)';
    case 'lodging':
      return 'Property name';
    case 'dining':
      return 'Cuisine';
    case 'activity':
      return 'Operator';
    case 'transit':
      return 'Operator';
  }
}

function initialTz(initial?: Partial<ReservationInput>): string {
  if (initial?.details && 'iana_timezone' in initial.details) {
    return initial.details.iana_timezone;
  }
  return 'America/Los_Angeles';
}

function initialDetailField(initial?: Partial<ReservationInput>): string {
  if (!initial?.details) return '';
  switch (initial.type) {
    case 'flight': {
      const d = initial.details as { carrier?: string; flight_number?: string };
      return d.carrier && d.flight_number ? `${d.carrier} ${d.flight_number}` : '';
    }
    case 'lodging':
      return (initial.details as { property_name?: string }).property_name ?? '';
    case 'dining':
      return (initial.details as { cuisine?: string }).cuisine ?? '';
    case 'activity':
      return (initial.details as { operator?: string }).operator ?? '';
    case 'transit':
      return (initial.details as { operator?: string }).operator ?? '';
    default:
      return '';
  }
}

function buildDetails(
  type: ReservationType,
  field: string,
  tz: string,
): ReservationInput['details'] {
  switch (type) {
    case 'flight': {
      const m = field.match(/^([A-Z]{2})\s?(\d+)$/i);
      return {
        carrier: m?.[1]?.toUpperCase() ?? (field.toUpperCase().slice(0, 2) || 'XX'),
        flight_number: m?.[2] ?? '0',
        iana_timezone: tz,
      };
    }
    case 'lodging':
      return { property_name: field || 'Property', iana_timezone: tz };
    case 'dining':
      return field ? { cuisine: field, iana_timezone: tz } : { iana_timezone: tz };
    case 'activity':
      return field ? { operator: field, iana_timezone: tz } : { iana_timezone: tz };
    case 'transit':
      return { mode: 'other', operator: field || undefined, iana_timezone: tz };
  }
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Reuse an existing location with a matching geocode_query (the place name acts as the
 * key for now) or create a new one. Geocoding to lat/lng is deferred; the map screen
 * already skips pins without coordinates.
 */
async function resolveLocationId(
  name: string,
  fallbackId: string | null | undefined,
  tripTimezone: string | null,
): Promise<string | null> {
  if (!name) return fallbackId ?? null;
  if (!tripTimezone) return fallbackId ?? null;
  const loc = await findOrCreateLocation({
    name,
    address: null,
    lat: null,
    lng: null,
    geocode_query: name,
    place_id: null,
    timezone: tripTimezone,
  });
  return loc.id;
}
