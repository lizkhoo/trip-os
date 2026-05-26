import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Card, EmptyState } from '@/components/ui';
import {
  importFile,
  listRecentAttachments,
  type ImportStep,
} from '@/services/syncUpload';

interface JobRow {
  id: string;
  name: string;
  thumbnailUri: string | null;
  kind: 'image' | 'pdf';
  step: ImportStep;
  detail?: string;
  candidateId: string | null;
  error: string | null;
}

interface RecentRow {
  id: string;
  storageUri: string;
  kind: string;
  createdAt: string;
}

function stepLabel(step: ImportStep): string {
  switch (step) {
    case 'stored':
      return 'Stored';
    case 'ocr':
      return 'Reading text…';
    case 'extracting':
      return 'Extracting reservation…';
    case 'done':
      return 'Done';
    case 'error':
      return 'Error';
  }
}

export default function UploadScreen() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshRecent = useCallback(async () => {
    const rows = await listRecentAttachments(20);
    setRecent(
      rows.map((r) => ({
        id: r.id,
        storageUri: r.storageUri,
        kind: r.kind,
        createdAt: r.createdAt,
      })),
    );
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const runImport = useCallback(
    async (uri: string, kind: 'image' | 'pdf', name: string, thumbnailUri: string | null) => {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setJobs((prev) => [
        ...prev,
        {
          id: localId,
          name,
          thumbnailUri,
          kind,
          step: 'stored',
          candidateId: null,
          error: null,
        },
      ]);
      const result = await importFile(uri, kind, {
        onProgress: (step, detail) => {
          setJobs((prev) =>
            prev.map((j) => (j.id === localId ? { ...j, step, detail } : j)),
          );
        },
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === localId
            ? {
                ...j,
                step: result.error ? 'error' : 'done',
                candidateId: result.candidateId,
                error: result.error ?? null,
              }
            : j,
        ),
      );
      await refreshRecent();
    },
    [refreshRecent],
  );

  const pickFromPhotos = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (res.canceled) return;
      await Promise.all(
        res.assets.map((a) =>
          runImport(a.uri, 'image', a.fileName ?? a.uri.split('/').pop() ?? 'image', a.uri),
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [runImport]);

  const pickFromFiles = useCallback(async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      await Promise.all(
        res.assets.map((a) => {
          const isPdf = (a.mimeType ?? '').includes('pdf') || a.name.toLowerCase().endsWith('.pdf');
          const kind: 'image' | 'pdf' = isPdf ? 'pdf' : 'image';
          return runImport(a.uri, kind, a.name, isPdf ? null : a.uri);
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [runImport]);

  const openCandidate = useCallback((candidateId: string) => {
    // Review queue lives on Agent 4's branch — tolerate the route being absent.
    void Linking.openURL(`trip-os:///admin/review/${candidateId}`).catch(() => {});
  }, []);

  return (
    <ScrollView className="flex-1 bg-paper-warm">
      <View className="p-6 gap-4">
        <Text className="font-serif text-3xl text-ink">Upload</Text>
        <Text className="text-ink-muted">
          Drop screenshots and PDFs of reservations. They run through on-device OCR and Claude
          extraction, landing in the review queue.
        </Text>
        <View className="flex-row gap-3">
          <Button
            title="Pick from Photos"
            onPress={pickFromPhotos}
            disabled={busy}
            className="flex-1"
          />
          <Button
            title="Pick from Files"
            onPress={pickFromFiles}
            disabled={busy}
            variant="secondary"
            className="flex-1"
          />
        </View>

        {jobs.length === 0 ? (
          <EmptyState
            title="No imports yet"
            description="Pick one or more files to start. You can keep picking — each file processes independently."
          />
        ) : (
          <View className="gap-3">
            {jobs.map((j) => (
              <Card key={j.id}>
                <View className="flex-row items-center gap-3">
                  {j.thumbnailUri ? (
                    <Image
                      source={{ uri: j.thumbnailUri }}
                      className="w-14 h-14 rounded-lg bg-paper-dim"
                    />
                  ) : (
                    <View className="w-14 h-14 rounded-lg bg-paper-dim items-center justify-center">
                      <Text className="text-ink-muted text-xs">{j.kind.toUpperCase()}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-ink font-medium" numberOfLines={1}>
                      {j.name}
                    </Text>
                    <Text className="text-ink-muted text-xs">{stepLabel(j.step)}</Text>
                    {j.error ? (
                      <Text className="text-accent-rust text-xs mt-1" numberOfLines={2}>
                        {j.error}
                      </Text>
                    ) : null}
                  </View>
                  {j.candidateId ? (
                    <Button
                      title="Review"
                      size="sm"
                      variant="ghost"
                      onPress={() => openCandidate(j.candidateId!)}
                    />
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}

        {recent.length > 0 ? (
          <View className="gap-2 mt-2">
            <Text className="font-serif text-xl text-ink">Recent</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
              <View className="flex-row gap-2">
                {recent.map((r) => (
                  <View
                    key={r.id}
                    className="w-20 h-20 rounded-lg overflow-hidden bg-paper-dim items-center justify-center"
                  >
                    {r.kind === 'image' ? (
                      <Image source={{ uri: r.storageUri }} className="w-full h-full" />
                    ) : (
                      <Text className="text-ink-muted text-xs">PDF</Text>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
