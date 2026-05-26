import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Image, Alert } from 'react-native';
import { eq } from 'drizzle-orm';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, ConfidenceChip, Input, ReservationBadge } from '@/components/ui';
import { acceptCandidate, getCandidate, rejectCandidate } from '@/services/candidates';
import { getReservation } from '@/services/reservations';
import { db } from '@/db/client';
import { attachments } from '@/db/schema';
import type { ExtractionCandidate } from '@/domain/candidate';
import type { Reservation, ReservationInput } from '@/domain/reservation';

type AttachmentRow = typeof attachments.$inferSelect;

export default function ReviewDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<ExtractionCandidate | null>(null);
  const [existing, setExisting] = useState<Reservation | null>(null);
  const [attachment, setAttachment] = useState<AttachmentRow | null>(null);
  const [edits, setEdits] = useState<Partial<ReservationInput>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    void (async () => {
      const c = await getCandidate(params.id);
      if (!c) return;
      setCandidate(c);
      if (c.merged_into_reservation_id) {
        const r = await getReservation(c.merged_into_reservation_id);
        if (r) setExisting(r);
      }
      if (c.source_ref) {
        const att = await db
          .select()
          .from(attachments)
          .where(eq(attachments.extractionRunId, c.source_ref))
          .get();
        if (att) setAttachment(att);
      }
    })();
  }, [params.id]);

  const merged = useMemo<ReservationInput | null>(() => {
    if (!candidate) return null;
    return { ...candidate.proposed_reservation, ...edits } as ReservationInput;
  }, [candidate, edits]);

  const onAccept = useCallback(async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      await acceptCandidate(candidate.id, edits);
      router.back();
    } catch (e) {
      Alert.alert('Accept failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [candidate, edits, router]);

  const onReject = useCallback(async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      await rejectCandidate(candidate.id);
      router.back();
    } catch (e) {
      Alert.alert('Reject failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [candidate, router]);

  if (!candidate || !merged) {
    return <SafeAreaView className="flex-1 bg-paper" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <Stack.Screen options={{ title: 'Candidate' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
        <View className="flex-row items-center gap-2 mb-2">
          <ReservationBadge type={merged.type} />
          <ConfidenceChip value={candidate.confidence} />
        </View>

        <SourcePreview candidate={candidate} attachment={attachment} />

        {existing ? <MergeDiff existing={existing} proposed={merged} /> : null}

        <Card className="mb-3">
          <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">Reservation</Text>
          <View className="gap-3">
            <Input
              label="Title"
              value={merged.title}
              onChangeText={(t) => setEdits((p) => ({ ...p, title: t }))}
            />
            <Input
              label="Start (ISO with offset)"
              value={merged.start_at}
              onChangeText={(t) => setEdits((p) => ({ ...p, start_at: t }))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Input
              label="End"
              value={merged.end_at ?? ''}
              onChangeText={(t) => setEdits((p) => ({ ...p, end_at: t || null }))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Input
              label="Confirmation code"
              value={merged.confirmation_code ?? ''}
              onChangeText={(t) => setEdits((p) => ({ ...p, confirmation_code: t || null }))}
              autoCapitalize="none"
            />
          </View>
        </Card>

        <View className="flex-row gap-3">
          <Button title={busy ? 'Working…' : 'Reject'} variant="ghost" onPress={onReject} />
          <Button title={busy ? 'Working…' : 'Accept'} onPress={onAccept} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SourcePreview({
  candidate,
  attachment,
}: {
  candidate: ExtractionCandidate;
  attachment: AttachmentRow | null;
}) {
  return (
    <Card className="mb-3">
      <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
        Source · {candidate.source}
      </Text>
      {attachment && attachment.kind === 'image' ? (
        <Image
          source={{ uri: attachment.storageUri }}
          style={{ width: '100%', height: 180, borderRadius: 12 }}
          resizeMode="cover"
        />
      ) : null}
      {attachment && attachment.kind === 'pdf' ? (
        <Text className="text-sm text-ink-soft">PDF attachment: {attachment.storageUri}</Text>
      ) : null}
      {candidate.raw_text ? (
        <Text className="text-sm text-ink-soft mt-2" numberOfLines={6}>
          {candidate.raw_text}
        </Text>
      ) : null}
    </Card>
  );
}

function MergeDiff({
  existing,
  proposed,
}: {
  existing: Reservation;
  proposed: ReservationInput;
}) {
  const fields: Array<[string, string | null | undefined, string | null | undefined]> = [
    ['title', existing.title, proposed.title],
    ['start_at', existing.start_at, proposed.start_at],
    ['end_at', existing.end_at, proposed.end_at],
    ['confirmation_code', existing.confirmation_code, proposed.confirmation_code],
  ];
  const changed = fields.filter(([, a, b]) => (a ?? '') !== (b ?? ''));
  return (
    <Card className="mb-3">
      <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
        Merge into existing reservation
      </Text>
      {changed.length === 0 ? (
        <Text className="text-sm text-ink-soft">No field changes detected.</Text>
      ) : (
        changed.map(([k, a, b]) => (
          <View key={k} className="mb-2">
            <Text className="text-[10px] uppercase tracking-wider text-ink-muted">{k}</Text>
            <Text className="text-sm text-accent-rust">- {String(a ?? '')}</Text>
            <Text className="text-sm text-accent-forest">+ {String(b ?? '')}</Text>
          </View>
        ))
      )}
    </Card>
  );
}
