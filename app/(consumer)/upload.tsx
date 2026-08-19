/**
 * Upload screen (typecheck-gated; not the verification surface — the e2e pathway
 * test owns correctness).
 *
 * Pick a screenshot (expo-image-picker) or a PDF (expo-document-picker) and run
 * the REAL `runUploadSync`, which copies the file into storage, OCRs it, runs
 * Claude vision extraction, writes an attachment + candidate, and auto-promotes
 * above the threshold. Shows simple progress; hi-conf imports land on the
 * timeline automatically, lo-conf ones wait in the review queue.
 *
 * Also the landing screen for files opened from outside the app ("Open in
 * trip-os", AirDrop) — useIncomingFileRouter pushes here with incomingUri +
 * incomingKind params and we run the same pipeline without a picker step.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui';
import type { AttachmentKind } from '@/services/storage';
import { runUploadSync, type UploadSyncResult } from '@/services/syncUpload';

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ incomingUri?: string; incomingKind?: string }>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');

  const run = useCallback(
    async (uri: string, kind: 'image' | 'pdf') => {
      setPhase('running');
      setMessage('Reading and extracting…');
      try {
        const result: UploadSyncResult = await runUploadSync({ uri, kind });
        setPhase('done');
        setMessage(
          result.promoted > 0
            ? 'Added to your timeline.'
            : 'Saved to your review queue — confirm it there.',
        );
      } catch (err) {
        setPhase('error');
        setMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  // A file handed to us from outside runs itself — the user already chose it in
  // Files/Mail/AirDrop, so a second "pick a file" tap would be pure friction.
  const autoRan = useRef<string | null>(null);
  useEffect(() => {
    const uri = params.incomingUri;
    const kind = params.incomingKind;
    if (!uri || autoRan.current === uri) return;
    if (kind !== 'pdf' && kind !== 'image') return;
    autoRan.current = uri;
    void run(uri, kind satisfies AttachmentKind);
  }, [params.incomingUri, params.incomingKind, run]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to import a screenshot.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0];
    if (!asset) return;
    await run(asset.uri, 'image');
  }, [run]);

  const pickPdf = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (res.canceled || res.assets.length === 0) return;
    const asset = res.assets[0];
    if (!asset) return;
    await run(asset.uri, 'pdf');
  }, [run]);

  const busy = phase === 'running';

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'Import a booking' }} />
      <Text className="text-ink/70 mb-6">
        Add a screenshot or PDF of a confirmation. We&apos;ll read it and add it to your trip. You
        can also send one here from another app with Share → trip-os, or AirDrop it from your Mac.
      </Text>

      <View className="gap-3">
        <Button title="Pick a screenshot" onPress={pickImage} disabled={busy} />
        <Button title="Pick a PDF" variant="ghost" onPress={pickPdf} disabled={busy} />
      </View>

      {phase !== 'idle' ? (
        <View className="mt-6">
          <Text
            className={
              phase === 'error' ? 'text-red-600' : 'text-ink/80'
            }
          >
            {message}
          </Text>
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
