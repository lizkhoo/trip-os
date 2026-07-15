/**
 * Review queue list (typecheck-gated; not the verification surface — the
 * gmail-to-timeline / upload-to-timeline / cross-path-dedup e2e pathways own
 * correctness for candidate creation, accept, and dedup/merge).
 *
 * Lists pending candidates via the REAL listPendingCandidates, ordered by
 * ascending confidence (most-uncertain first). Each card leads with StatusChip.
 * Separately surfaces recently merged_into candidates labelled as DEDUP HITS.
 */
import { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link, Stack, useFocusEffect } from 'expo-router';
import { HeaderBack } from '@/components/HeaderBack';
import { eq } from 'drizzle-orm';
import {
  Card,
  ConfidenceChip,
  EmptyState,
  PullToRefresh,
  ReservationBadge,
  StatusChip,
} from '@/components/ui';
import { listPendingCandidates } from '@/services/candidates';
import { getDb } from '@/db/client';
import { extractionCandidates } from '@/db/schema';
import type { ExtractionCandidate } from '@/domain/candidate';

function rowToDomain(row: typeof extractionCandidates.$inferSelect): ExtractionCandidate {
  return {
    id: row.id,
    trip_id: row.tripId,
    source: row.source as ExtractionCandidate['source'],
    source_ref: row.sourceRef,
    raw_text: row.rawText,
    claude_response: row.claudeResponse,
    proposed_reservation: JSON.parse(row.proposedReservation),
    confidence: row.confidence,
    status: row.status as ExtractionCandidate['status'],
    merged_into_reservation_id: row.mergedIntoReservationId,
  };
}

async function listMergedCandidates(): Promise<ExtractionCandidate[]> {
  const rows = await getDb()
    .select()
    .from(extractionCandidates)
    .where(eq(extractionCandidates.status, 'merged_into'));
  return rows.map(rowToDomain);
}

export default function ReviewQueueScreen() {
  const [pending, setPending] = useState<ExtractionCandidate[]>([]);
  const [merged, setMerged] = useState<ExtractionCandidate[]>([]);

  const refresh = useCallback(async () => {
    const list = await listPendingCandidates();
    // Most-uncertain first: ascending confidence.
    list.sort((a, b) => a.confidence - b.confidence);
    setPending(list);
    setMerged(await listMergedCandidates());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Review', headerLeft: () => <HeaderBack /> }} />
      <PullToRefresh
        onRefresh={refresh}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}
      >
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            description="High-confidence imports are added automatically. Anything uncertain shows up here."
          />
        ) : (
          pending.map((c) => <CandidateRow key={c.id} candidate={c} />)
        )}

        {merged.length > 0 ? (
          <View className="mt-8">
            <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
              Dedup hits ({merged.length})
            </Text>
            {merged.map((c) => (
              <MergedRow key={c.id} candidate={c} />
            ))}
          </View>
        ) : null}
      </PullToRefresh>
    </>
  );
}

function CandidateRow({ candidate }: { candidate: ExtractionCandidate }) {
  const p = candidate.proposed_reservation;
  return (
    <Link href={{ pathname: '/review/[id]', params: { id: candidate.id } }} asChild>
      <Pressable className="mb-3">
        <Card>
          <View className="flex-row items-center gap-2 mb-1 flex-wrap">
            <StatusChip status="needs_review" />
            <ReservationBadge type={p.type} />
            <ConfidenceChip value={candidate.confidence} />
          </View>
          <Text className="text-base font-medium text-ink">{p.title}</Text>
          <Text className="text-xs uppercase tracking-widest text-ink-muted mt-1">
            via {candidate.source}
            {candidate.trip_id ? '' : ' · no trip assigned'}
          </Text>
        </Card>
      </Pressable>
    </Link>
  );
}

function MergedRow({ candidate }: { candidate: ExtractionCandidate }) {
  const p = candidate.proposed_reservation;
  return (
    <Card variant="plain" className="mb-2 border border-paper-dim">
      <View className="flex-row items-center justify-between mb-1">
        <ReservationBadge type={p.type} label="Merged" />
        <Text className="text-[10px] uppercase tracking-wider text-ink-muted">via {candidate.source}</Text>
      </View>
      <Text className="text-sm text-ink-soft">{p.title}</Text>
      <Text className="text-xs text-ink-muted mt-1">
        Duplicate — collapsed into an existing reservation.
      </Text>
    </Card>
  );
}
