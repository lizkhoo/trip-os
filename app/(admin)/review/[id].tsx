/**
 * Review candidate detail (typecheck-gated; not the verification surface — the
 * gmail-to-timeline / upload-to-timeline e2e pathways own correctness for
 * getCandidate / acceptCandidate / rejectCandidate).
 *
 * Loads a candidate via REAL getCandidate, lets the user pick a trip when the
 * candidate has none auto-assigned, then accepts via REAL acceptCandidate(id,
 * { trip_id }) or rejects via REAL rejectCandidate. A merged_into candidate is a
 * dedup hit (collapsed into an existing reservation) and is shown read-only.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Button,
  Card,
  ConfidenceChip,
  EmptyState,
  ReservationBadge,
  Select,
  type SelectOption,
} from '@/components/ui';
import { getCandidate, acceptCandidate, rejectCandidate } from '@/services/candidates';
import { listTrips } from '@/services/trips';
import type { ExtractionCandidate } from '@/domain/candidate';
import { color } from '@/theme/tokens';

export default function ReviewDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [candidate, setCandidate] = useState<ExtractionCandidate | null>(null);
  const [tripOptions, setTripOptions] = useState<SelectOption[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (typeof id !== 'string') return;
      const c = await getCandidate(id);
      const trips = await listTrips();
      if (!active) return;
      setCandidate(c ?? null);
      setTripOptions(trips.map((t) => ({ value: t.id, label: t.title })));
      setTripId(c?.trip_id ?? trips[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const onAccept = useCallback(async () => {
    if (typeof id !== 'string') return;
    if (!tripId) {
      Alert.alert('Pick a trip', 'Assign this reservation to a trip before accepting.');
      return;
    }
    setBusy(true);
    try {
      await acceptCandidate(id, { trip_id: tripId });
      router.back();
    } catch (err) {
      Alert.alert('Could not accept', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [id, tripId, router]);

  const onReject = useCallback(async () => {
    if (typeof id !== 'string') return;
    setBusy(true);
    try {
      await rejectCandidate(id);
      router.back();
    } catch (err) {
      Alert.alert('Could not reject', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [id, router]);

  if (loading) {
    return (
      <View className="flex-1 bg-paper items-center justify-center">
        <ActivityIndicator color={color.inkMuted} />
      </View>
    );
  }

  if (!candidate) {
    return (
      <View className="flex-1 bg-paper">
        <EmptyState
          title="Candidate not found"
          action={<Button title="Back" onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const p = candidate.proposed_reservation;
  const isMerged = candidate.status === 'merged_into';
  const isPending = candidate.status === 'pending';

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'Review' }} />

      <Card className="mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <ReservationBadge type={p.type} label={isMerged ? 'Merged' : undefined} />
          <ConfidenceChip value={candidate.confidence} />
        </View>
        <Text className="text-lg font-medium text-ink">{p.title}</Text>
        <Text className="text-sm text-ink-soft mt-1">{p.start_at}</Text>
        {p.end_at ? <Text className="text-sm text-ink-soft">→ {p.end_at}</Text> : null}
        {p.confirmation_code ? (
          <Text className="text-xs uppercase tracking-widest text-ink-muted mt-2">
            Conf {p.confirmation_code}
          </Text>
        ) : null}
        <Text className="text-xs uppercase tracking-widest text-ink-muted mt-2">
          via {candidate.source} · {candidate.status}
        </Text>
      </Card>

      {isMerged ? (
        <Card variant="plain" className="border border-paper-dim">
          <Text className="text-sm text-ink-soft">
            This is a dedup hit — it collapsed into an existing reservation. Its attachment (if
            any) was kept and linked to that reservation.
          </Text>
        </Card>
      ) : null}

      {isPending ? (
        <View className="gap-4">
          <Select
            label="Trip"
            value={tripId}
            options={tripOptions}
            onChange={setTripId}
            placeholder="Assign a trip…"
          />
          <View className="gap-2">
            <Button title={busy ? 'Accepting…' : 'Accept'} onPress={onAccept} disabled={busy} />
            <Button title="Reject" variant="ghost" onPress={onReject} disabled={busy} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
