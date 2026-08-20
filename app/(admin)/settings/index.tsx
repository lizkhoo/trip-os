import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { HeaderBack } from '@/components/HeaderBack';
import Slider from '@react-native-community/slider';
import { eq } from 'drizzle-orm';
import { ApiKeyField, Button, Card, Input } from '@/components/ui';
import { getDb } from '@/db/client';
import { settings } from '@/db/schema';
import { setAnthropicKey, getAnthropicKey, clearAnthropicKey } from '@/services/secrets';

const THRESHOLD_MIN = 0.5;
const THRESHOLD_MAX = 1.0;
const THRESHOLD_STEP = 0.05;

const SETTINGS_ID = 'default';

interface SettingsState {
  autoPromoteThreshold: number;
  gmailLabelName: string;
  senderAllowlist: string[];
}

export default function SettingsScreen() {
  const [hasKey, setHasKey] = useState(false);
  const [state, setState] = useState<SettingsState>({
    autoPromoteThreshold: 0.9,
    gmailLabelName: 'trip-os/inbox',
    senderAllowlist: [],
  });
  const [newSender, setNewSender] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setHasKey(!!(await getAnthropicKey()));
    const row = await getDb().select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
    if (row) {
      let allowlist: string[] = [];
      try {
        const parsed = JSON.parse(row.senderAllowlist);
        if (Array.isArray(parsed)) {
          allowlist = parsed.filter((s): s is string => typeof s === 'string');
        }
      } catch {
        allowlist = [];
      }
      setState({
        autoPromoteThreshold: row.autoPromoteThreshold,
        gmailLabelName: row.gmailLabelName,
        senderAllowlist: allowlist,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveKey = useCallback(async (key: string) => {
    await setAnthropicKey(key);
    setHasKey(true);
  }, []);

  const removeKey = useCallback(async () => {
    await clearAnthropicKey();
    setHasKey(false);
  }, []);

  const persistSettings = useCallback(
    async (next: SettingsState) => {
      // Defense-in-depth clamp — the slider already pins values to range, but
      // the threshold field is the kind of thing future code might mutate.
      const threshold = clamp(next.autoPromoteThreshold, THRESHOLD_MIN, THRESHOLD_MAX);
      setBusy(true);
      try {
        await getDb()
          .update(settings)
          .set({
            autoPromoteThreshold: threshold,
            gmailLabelName: next.gmailLabelName,
            senderAllowlist: JSON.stringify(next.senderAllowlist),
          })
          .where(eq(settings.id, SETTINGS_ID));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const addSender = useCallback(async () => {
    const v = newSender.trim().toLowerCase();
    if (!v) return;
    if (state.senderAllowlist.includes(v)) {
      Alert.alert('Already on list', `"${v}" is already in your allowlist.`);
      return;
    }
    const next = { ...state, senderAllowlist: [...state.senderAllowlist, v] };
    setState(next);
    setNewSender('');
    await persistSettings(next);
  }, [newSender, state, persistSettings]);

  const removeSender = useCallback(
    async (s: string) => {
      const next = {
        ...state,
        senderAllowlist: state.senderAllowlist.filter((x) => x !== s),
      };
      setState(next);
      await persistSettings(next);
    },
    [state, persistSettings],
  );

  const updateThreshold = useCallback(
    async (n: number) => {
      const next = { ...state, autoPromoteThreshold: n };
      setState(next);
      await persistSettings(next);
    },
    [state, persistSettings],
  );

  const updateLabel = useCallback(
    async (s: string) => {
      const next = { ...state, gmailLabelName: s };
      setState(next);
      await persistSettings(next);
    },
    [state, persistSettings],
  );

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'Settings', headerLeft: () => <HeaderBack /> }} />

      <Card className="mb-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
          Anthropic API key
        </Text>
        {hasKey ? (
          <View>
            <Text className="text-base text-ink">Stored in Keychain ✓</Text>
            <View className="mt-3">
              <Button title="Remove key" variant="ghost" onPress={removeKey} />
            </View>
          </View>
        ) : (
          <ApiKeyField onSave={saveKey} />
        )}
      </Card>

      <Card className="mb-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
          Auto-promote threshold
        </Text>
        <Text className="text-xs text-ink-muted mb-2">
          Candidates with confidence ≥ this commit automatically.
        </Text>
        <View className="flex-row items-center gap-3">
          <Slider
            style={{ flex: 1 }}
            minimumValue={THRESHOLD_MIN}
            maximumValue={THRESHOLD_MAX}
            step={THRESHOLD_STEP}
            value={state.autoPromoteThreshold}
            onSlidingComplete={updateThreshold}
          />
          <Text className="text-base text-ink font-mono w-12 text-right">
            {state.autoPromoteThreshold.toFixed(2)}
          </Text>
        </View>
      </Card>

      <Card className="mb-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
          Gmail label fallback
        </Text>
        <Text className="text-xs text-ink-muted mb-2">
          Messages matching this label are pulled in addition to allowlist senders.
        </Text>
        <Input value={state.gmailLabelName} onChangeText={updateLabel} autoCapitalize="none" />
      </Card>

      <Card className="mb-6">
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">
          Sender allowlist
        </Text>
        <Text className="text-xs text-ink-muted mb-2">
          Confirmation emails from these senders/domains will be scanned.
        </Text>
        {state.senderAllowlist.length === 0 ? (
          <Text className="text-sm text-ink-muted italic">No senders yet.</Text>
        ) : (
          state.senderAllowlist.map((s) => (
            <View
              key={s}
              className="flex-row justify-between items-center py-2 border-b border-paper-dim last:border-b-0"
            >
              <Text className="text-base text-ink flex-1 mr-2">{s}</Text>
              <Button
                title="Remove"
                variant="ghost"
                size="sm"
                onPress={() => void removeSender(s)}
              />
            </View>
          ))
        )}
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Input
              placeholder="booking.com"
              value={newSender}
              onChangeText={setNewSender}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Button title={busy ? 'Saving…' : 'Add'} onPress={addSender} disabled={busy} />
        </View>
      </Card>
    </ScrollView>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
