import { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, ConfidenceChip, EmptyState, PullToRefresh, ReservationBadge } from '@/components/ui';
import { listPendingCandidates } from '@/services/candidates';
import type { ExtractionCandidate } from '@/domain/candidate';

const SOURCE_ICON: Record<ExtractionCandidate['source'], string> = {
  gmail: '✉',
  upload: '↑',
  manual: '✎',
};

export default function ReviewIndex() {
  const [items, setItems] = useState<ExtractionCandidate[]>([]);

  const refresh = useCallback(async () => {
    const rows = await listPendingCandidates();
    // listPendingCandidates returns rows without a created_at field. Sort by id as a stable
    // proxy — Drizzle inserts assign uuid v4s, so this is effectively a usage-order arrival.
    // (Adding created_at to the candidate domain would require a Foundation change.)
    setItems([...rows].reverse());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['bottom']}>
      <PullToRefresh
        onRefresh={refresh}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}
      >
        <Text className="font-serif text-4xl text-ink mb-4">Review</Text>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing pending"
            description="Candidates from Gmail or uploads will appear here for accept / reject."
          />
        ) : (
          items.map((c) => <Row key={c.id} candidate={c} />)
        )}
      </PullToRefresh>
    </SafeAreaView>
  );
}

function Row({ candidate }: { candidate: ExtractionCandidate }) {
  const proposed = candidate.proposed_reservation;
  return (
    <Link href={{ pathname: '/(admin)/review/[id]', params: { id: candidate.id } }} asChild>
      <Pressable className="mb-3">
        <Card>
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-base">{SOURCE_ICON[candidate.source]}</Text>
            <ReservationBadge type={proposed.type} />
            <ConfidenceChip value={candidate.confidence} />
            {candidate.merged_into_reservation_id ? (
              <View className="self-start rounded-full bg-accent-ochre px-2 py-0.5">
                <Text className="text-[10px] uppercase tracking-wider text-paper">Merge</Text>
              </View>
            ) : null}
          </View>
          <Text className="font-serif text-xl text-ink">{proposed.title}</Text>
          <Text className="text-xs uppercase tracking-widest text-ink-muted mt-1">
            {proposed.start_at}
          </Text>
        </Card>
      </Pressable>
    </Link>
  );
}
