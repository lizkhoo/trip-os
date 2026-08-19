/**
 * Paste screen (typecheck-gated; not the verification surface — the e2e pathway
 * test owns correctness).
 *
 * The cheapest ingestion path: a textarea. Paste the body of a confirmation
 * email, a message from whoever booked the table, or dictate a sentence with the
 * keyboard mic — then run the REAL `runPasteSync`, which extracts with Claude,
 * writes a candidate, and auto-promotes above the threshold. Hi-conf pastes land
 * on the timeline; lo-conf ones wait in the review queue.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { Button, Input } from '@/components/ui';
import { runPasteSync } from '@/services/syncPaste';

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function PasteScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');

  const pasteFromClipboard = useCallback(async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip.trim().length === 0) {
      setPhase('error');
      setMessage('Your clipboard is empty.');
      return;
    }
    setText(clip);
    setPhase('idle');
    setMessage('');
  }, []);

  const run = useCallback(async () => {
    setPhase('running');
    setMessage('Reading and extracting…');
    try {
      const result = await runPasteSync({ text });
      setPhase('done');
      setMessage(
        result.promoted > 0
          ? 'Added to your timeline.'
          : 'Saved to your review queue — confirm it there.',
      );
      setText('');
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [text]);

  const busy = phase === 'running';

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Paste a booking' }} />
      <Text className="text-ink/70 mb-6">
        Paste a confirmation email, a message from whoever booked it, or just describe the booking.
        Tap the mic on your keyboard to say it out loud instead.
      </Text>

      <Input
        label="Booking details"
        multiline
        textAlignVertical="top"
        className="h-56"
        placeholder={'e.g. Park Hyatt Tokyo, check in March 3, check out March 7, confirmation 4RT9KX'}
        value={text}
        onChangeText={(next) => {
          setText(next);
          if (phase !== 'running') setPhase('idle');
        }}
        editable={!busy}
      />

      <View className="gap-3 mt-4">
        <Button
          title="Extract booking"
          onPress={run}
          disabled={busy || text.trim().length === 0}
        />
        <Button
          title="Paste from clipboard"
          variant="ghost"
          onPress={pasteFromClipboard}
          disabled={busy}
        />
      </View>

      {phase !== 'idle' ? (
        <View className="mt-6">
          <Text className={phase === 'error' ? 'text-accent-rust' : 'text-ink/80'}>{message}</Text>
          {phase === 'done' ? (
            <View className="mt-4">
              <Button title="Back to trip" variant="ghost" onPress={() => router.back()} />
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
